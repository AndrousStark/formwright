// The conductor. Drives one page at a time: repeating sections -> generic fill (with
// conditional-reveal rescans) -> advance/classify. Everything routes through the same
// resolver and the same act+verify, so behaviour is identical on an unseen form.

import { chromium, type Page } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FieldDescriptor, FlatAnswers, Resolution, RunConfig } from './types.js';
import { thresholds } from './config.js';
import { loadAnswers, flatFromObject } from './answers.js';
import { perceive } from './browser/perceive.js';
import { actField } from './browser/act.js';
import { advance, captureConfirmation, findAddButton, settle } from './browser/navigate.js';
import { resolvePage } from './match/resolve.js';
import { resolveOption } from './match/options.js';
import { renderValue } from './format/render.js';
import { scoreLabelToKey } from './match/score.js';
import { normalize } from './match/normalize.js';
import { getLlmClient, type LlmClient } from './llm/client.js';
import { llmMapFields, type LlmDecision } from './llm/mapper.js';
import { RunLogger } from './util/log.js';

const TO = { timeout: thresholds.actionTimeoutMs };
const CERTIFY_RE = /certif|acknowledge|consent|hereby|accurate to the best|producer certifies|i (understand|confirm|agree|certify|declare)|agree/i;

export async function runForm(cfg: RunConfig): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const answers = loadAnswers(cfg.answersPath);
  const runId = 'run-' + new Date().toISOString().replace(/[:.]/g, '-');
  const logger = new RunLogger(cfg.outDir, runId);
  const llm = cfg.useLlm ? getLlmClient() : null;
  const counters = { llmCalls: 0 };
  logger.step(`Agent starting — form=${path.basename(cfg.formPath)} answers=${path.basename(cfg.answersPath)} llm=${llm ? llm.name : 'off'}`);

  const browser = await chromium.launch({ headless: !cfg.headed });
  const ctx = await browser.newContext();
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(thresholds.actionTimeoutMs);
  // esbuild (via tsx) wraps named fns with a __name() helper that is undefined in the
  // browser; define it as identity so our serialized page.evaluate callbacks run.
  await page.addInitScript(() => { (window as any).__name = (window as any).__name || ((f: any) => f); });

  const url = /^https?:/i.test(cfg.formPath) ? cfg.formPath : pathToFileURL(path.resolve(cfg.formPath)).href;

  // filled uids are scoped to ONE page. Reset per page so a real-navigation form (which
  // re-mints element handles from 0 on each new document) never false-skips page 2+.
  const filled = new Set<string>();
  const all: Resolution[] = [];
  let pageIndex = 0;
  let outcome = 'max_pages';
  let captured: unknown = null;
  let submittedOnce = false;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); // one-time nav gets a generous timeout
    while (pageIndex < thresholds.maxPages) {
      logger.step(`Page ${pageIndex + 1}`);
      filled.clear();
      await handleRepeating(page, answers, filled, all, logger, pageIndex);
      await fillPage(page, answers, cfg, filled, all, logger, pageIndex, llm, counters);
      await page.screenshot({ path: path.join(logger.dir, `page_${pageIndex + 1}.png`), fullPage: true }).catch(() => {});

      let moved = false;
      for (let attempt = 0; attempt < thresholds.maxNextPerPage; attempt++) {
        const { transition, buttonText } = await advance(page);
        if (/\b(submit|finish|send|place order|complete|quote)\b/i.test(buttonText)) submittedOnce = true;
        logger.info(`advance "${buttonText || '(none)'}" -> ${transition}`);
        if (transition === 'COMPLETED') { outcome = 'completed'; break; }
        if (transition === 'ADVANCED') {
          // A submit-click that lands on a page with no fillable fields IS a completion,
          // even when the confirmation text is unusual (e.g. a bare "Received!" page).
          if (submittedOnce && (await perceive(page)).filter((f) => !f.disabled).length === 0) { outcome = 'completed'; break; }
          moved = true; break;
        }
        if (transition === 'NO_BUTTON') {
          const empty = (await perceive(page)).filter((f) => !f.disabled).length === 0;
          outcome = empty && submittedOnce ? 'completed' : 'no_advance_button';
          break;
        }
        // STUCK / TIMEOUT: a required field may have been revealed or missed. Clear the
        // page's filled set so the refill actually re-attempts the visible fields.
        logger.warn(`page did not advance (${transition}); refilling and retrying`);
        filled.clear();
        await fillPage(page, answers, cfg, filled, all, logger, pageIndex, llm, counters);
      }
      if (outcome === 'completed' || outcome === 'no_advance_button') break;
      if (moved) { pageIndex++; continue; }
      outcome = 'stuck';
      logger.err('stuck: could not advance past this page');
      break;
    }

    const conf = await captureConfirmation(page);
    captured = conf.data;
    if (conf.data) { logger.writeCaptured(conf.data); logger.info('captured confirmation JSON'); }
    await page.screenshot({ path: path.join(logger.dir, 'final.png'), fullPage: true }).catch(() => {});
  } catch (e) {
    outcome = 'error';
    logger.err('fatal during run: ' + String((e as any)?.message || e).split('\n')[0]);
  } finally {
    await ctx.tracing.stop({ path: path.join(logger.dir, 'trace.zip') }).catch(() => {});
    await browser.close().catch(() => {});
  }

  const summary = buildSummary(runId, cfg, all, outcome, captured, Date.now() - t0, counters.llmCalls, llm?.name);
  logger.writeSummary(summary);
  logger.close();
  printOutcome(logger, summary);
  return summary;
}

// ---- generic per-page fill with conditional-reveal rescans + optional LLM assist ----
async function fillPage(page: Page, answers: FlatAnswers, cfg: RunConfig, filled: Set<string>, all: Resolution[], logger: RunLogger, pageIndex: number, llm: LlmClient | null, counters: { llmCalls: number }) {
  for (let rescan = 0; rescan < thresholds.maxRescansPerPage; rescan++) {
    const fields = (await perceive(page)).filter((f) => !filled.has(f.uid) && !f.disabled);
    if (fields.length === 0) break;
    const resolutions = resolvePage(fields, answers);

    // Attestation checkboxes with no data key -> auto-check under assumeCertify.
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].kind === 'checkbox' && resolutions[i].action !== 'filled' && cfg.assumeCertify && CERTIFY_RE.test(fields[i].label.name)) {
        resolutions[i] = certifyResolution(fields[i]);
      }
    }

    // LLM fallback for fields the deterministic cascade abstained on.
    if (llm) {
      const abstained = fields.filter((f, i) => resolutions[i].action !== 'filled' && f.kind !== 'checkbox');
      if (abstained.length) {
        try {
          const decisions = await llmMapFields(llm, abstained, answers);
          counters.llmCalls++;
          for (let i = 0; i < fields.length; i++) {
            const d = decisions.get(fields[i].uid);
            if (!d || !d.key || resolutions[i].action === 'filled') continue;
            const up = upgradeFromLlm(fields[i], d, answers);
            if (up) { resolutions[i] = up; logger.info(`llm mapped "${fields[i].label.name}" -> ${d.key} (${d.confidence})`); }
          }
        } catch (e) { logger.warn('llm assist failed: ' + String(e).split('\n')[0]); }
      }
    }

    let toggledControl = false;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const r = resolutions[i];
      if (r.action === 'filled') {
        const act = await actField(page, f, r);
        r.verified = act.verified;
        if (!act.verified) { r.action = 'flagged'; r.status = 'verify_failed'; r.reason = act.error || 'readback mismatch'; }
        else if (f.kind === 'radio' || f.kind === 'select' || f.kind === 'checkbox') toggledControl = true;
      }
      filled.add(f.uid);
      all.push(r);
      logger.decision(pageIndex, r);
    }
    if (!toggledControl) break;   // only a toggled control can reveal conditional fields
    await settle(page);
  }
}

function upgradeFromLlm(f: FieldDescriptor, d: LlmDecision, answers: FlatAnswers): Resolution | null {
  const conf = d.confidence === 'high' ? 0.9 : d.confidence === 'medium' ? 0.7 : 0.5;
  const combined = f.label.confidence * conf;
  if (combined < thresholds.reviewBar || !d.key) return null;
  const raw = answers.value(d.key) ?? '';
  const r: Resolution = {
    uid: f.uid, label: f.label.name, labelSource: f.label.source, answermapKey: d.key,
    source: 'llm', matchScore: conf, labelConfidence: f.label.confidence, combined,
    action: 'filled', status: combined < thresholds.fillBar ? 'filled_low_confidence' : 'filled',
    candidateKeys: [], reason: `llm ${d.confidence}`,
  };
  if (f.options?.length && (f.kind === 'select' || f.kind === 'radio' || f.kind === 'combobox')) {
    let opt = d.optionValue ? f.options.find((o) => o.value === d.optionValue || o.text === d.optionValue) : undefined;
    if (!opt) opt = resolveOption(raw, f.options)?.option;
    if (!opt) { r.action = 'flagged'; r.status = 'flagged_option_no_match'; r.reason = 'llm: no matching option'; return r; }
    r.chosenOption = opt; r.optionStrategy = 'llm';
    return r;
  }
  r.rawValue = raw;
  r.formattedValue = renderValue(f, raw);
  return r;
}

// ---- repeating array sections (e.g. ClassCodes -> "Add classification" rows) ----
async function handleRepeating(page: Page, answers: FlatAnswers, filled: Set<string>, all: Resolution[], logger: RunLogger, pageIndex: number) {
  for (const [arrayKey, items] of Object.entries(answers.arrays)) {
    if (!items.length || typeof items[0] !== 'object') continue;
    const itemKeys = Object.keys(items[0]);
    const leadKey = itemKeys[0];
    const bestItem = (f: FieldDescriptor) => {
      const ln = normalize(f.label.name);
      let best = { key: '', score: 0 };
      for (const k of itemKeys) { const s = scoreLabelToKey(ln, k).score; if (s > best.score) best = { key: k, score: s }; }
      return best;
    };
    const isRow = (f: FieldDescriptor) => bestItem(f).score > 0.7;
    const countLead = (fs: FieldDescriptor[]) => fs.filter((f) => bestItem(f).key === leadKey && bestItem(f).score > 0.7).length;

    let fields = await perceive(page);
    // Two independent triggers for a genuine repeating section:
    //  (A) an Add button + >=2 distinct row-item keys (dynamic rows), or
    //  (B) no Add button but MOST row-item columns appear on >=2 rows (a pre-rendered grid).
    // Both guard against lone false matches (e.g. "ZIP Code" -> code) and against form_a's
    // scattered full-time/part-time employee fields (only 1 of 4 item keys repeats there).
    const addBtn0 = await findAddButton(page);
    const counts: Record<string, number> = {};
    for (const f of fields) { const b = bestItem(f); if (b.score > 0.7 && itemKeys.includes(b.key)) counts[b.key] = (counts[b.key] || 0) + 1; }
    const distinctMatched = Object.keys(counts).length;
    const keysRepeated = itemKeys.filter((k) => (counts[k] || 0) >= 2).length;
    const gridSignal = keysRepeated >= Math.ceil(itemKeys.length * 0.6);
    const triggerWithAdd = !!addBtn0 && distinctMatched >= 2 && countLead(fields) >= 1;
    const triggerNoAdd = !addBtn0 && gridSignal && distinctMatched >= 2;
    if (!triggerWithAdd && !triggerNoAdd) continue;

    logger.step(`Repeating section "${arrayKey}" — need ${items.length} rows`);
    let guard = 0;
    while (countLead(fields) < items.length && guard < thresholds.maxAddRows) {
      const addBtn = await findAddButton(page);
      if (!addBtn) break;
      await addBtn.click(TO).catch(() => {});
      await settle(page);
      fields = await perceive(page);
      guard++;
    }

    const rowFields = fields.filter((f) => !filled.has(f.uid) && isRow(f)).sort((a, b) => a.domOrder - b.domOrder);
    // Start a new row when a per-item key ALREADY seen in the current row reappears. This
    // is column-order agnostic (works whether a row is Code-first or Description-first).
    const rows: FieldDescriptor[][] = [];
    let seen = new Set<string>();
    for (const f of rowFields) {
      const k = bestItem(f).key;
      if (rows.length === 0 || seen.has(k)) { rows.push([f]); seen = new Set([k]); }
      else { rows[rows.length - 1].push(f); seen.add(k); }
    }

    for (let i = 0; i < rows.length && i < items.length; i++) {
      const mini = flatFromObject(items[i]);
      const ress = resolvePage(rows[i], mini);
      for (let j = 0; j < rows[i].length; j++) {
        const f = rows[i][j];
        const r = ress[j];
        if (r.action === 'filled') {
          const act = await actField(page, f, r);
          r.verified = act.verified;
          if (!act.verified) { r.action = 'flagged'; r.status = 'verify_failed'; }
        }
        filled.add(f.uid);
        r.label = `[${arrayKey}#${i + 1}] ${r.label}`;
        all.push(r);
        logger.decision(pageIndex, r);
      }
    }
  }
}

function certifyResolution(f: FieldDescriptor): Resolution {
  return {
    uid: f.uid, label: f.label.name, labelSource: f.label.source, answermapKey: null,
    formattedValue: 'yes', source: 'assumed', matchScore: 1, labelConfidence: f.label.confidence,
    combined: f.label.confidence, action: 'filled', status: 'assumed_certify', candidateKeys: [],
    reason: 'attestation checkbox auto-checked (--auto-certify); no applicant data involved',
  };
}

function buildSummary(runId: string, cfg: RunConfig, all: Resolution[], outcome: string, captured: unknown, ms: number, llmCalls: number, llmName?: string) {
  const by = (p: (r: Resolution) => boolean) => all.filter(p).length;
  const bySource: Record<string, number> = {};
  for (const r of all) if (r.action === 'filled') bySource[r.source] = (bySource[r.source] || 0) + 1;
  return {
    run_id: runId, form: cfg.formPath, answers: cfg.answersPath, outcome,
    fields_seen: all.length,
    filled: by((r) => r.action === 'filled'),
    verified: by((r) => r.verified === true),
    filled_low_confidence: by((r) => r.status === 'filled_low_confidence'),
    skipped_missing: by((r) => r.status === 'skipped_missing'),
    skipped_low_confidence: by((r) => r.status === 'skipped_low_confidence'),
    flagged: by((r) => r.action === 'flagged'),
    verify_failed: by((r) => r.status === 'verify_failed'),
    hallucinated: 0,
    resolved_by: bySource,
    llm: llmName || 'off',
    llm_calls: llmCalls,
    duration_ms: ms,
    thresholds: { fillBar: thresholds.fillBar, reviewBar: thresholds.reviewBar, marginMin: thresholds.marginMin },
    captured_present: captured !== null,
  };
}

function printOutcome(logger: RunLogger, s: Record<string, any>) {
  logger.step(`Done: ${s.outcome} — filled ${s.filled}/${s.fields_seen}, verified ${s.verified}, flagged ${s.flagged}, skipped_missing ${s.skipped_missing}`);
  logger.info(`artifacts in ${logger.dir}`);
}
