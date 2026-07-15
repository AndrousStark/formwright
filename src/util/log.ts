// Structured observability: one JSONL decision-record per field + a human console
// line + a machine-readable run summary. This is the artifact an engineer debugs with.

import fs from 'node:fs';
import path from 'node:path';
import type { Resolution } from '../types.js';

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', bold: '\x1b[1m',
};

export class RunLogger {
  readonly runId: string;
  readonly dir: string;
  private jsonl: fs.WriteStream;
  private records: any[] = [];

  constructor(outDir: string, runId: string) {
    this.runId = runId;
    this.dir = path.join(outDir, runId);
    fs.mkdirSync(this.dir, { recursive: true });
    this.jsonl = fs.createWriteStream(path.join(this.dir, 'decisions.jsonl'), { flags: 'a' });
  }

  info(msg: string) { console.log(`${C.dim}·${C.reset} ${msg}`); }
  step(msg: string) { console.log(`${C.blue}${C.bold}▸${C.reset} ${C.bold}${msg}${C.reset}`); }
  warn(msg: string) { console.log(`${C.yellow}⚠${C.reset} ${msg}`); }
  err(msg: string) { console.log(`${C.red}✗${C.reset} ${msg}`); }

  decision(pageIndex: number, r: Resolution, extra: Record<string, unknown> = {}) {
    const rec = {
      run_id: this.runId, ts: new Date().toISOString(), page_index: pageIndex,
      uid: r.uid, question_label: r.label, label_source: r.labelSource,
      label_confidence: round(r.labelConfidence), answermap_key: r.answermapKey,
      match_score: round(r.matchScore), combined: round(r.combined),
      source: r.source, action: r.action, status: r.status,
      formatted_value: r.formattedValue ?? null,
      chosen_option: r.chosenOption ? { value: r.chosenOption.value, text: r.chosenOption.text } : null,
      option_strategy: r.optionStrategy ?? null,
      candidate_keys: r.candidateKeys.map((c) => ({ key: c.key, score: round(c.score) })),
      verified: r.verified ?? null, reason: r.reason, ...extra,
    };
    this.records.push(rec);
    this.jsonl.write(JSON.stringify(rec) + '\n');

    const icon = r.action === 'filled' ? `${C.green}✓${C.reset}`
      : r.action === 'flagged' ? `${C.yellow}⚑${C.reset}` : `${C.red}∅${C.reset}`;
    const val = r.formattedValue !== undefined ? ` = ${C.cyan}${truncate(r.formattedValue, 42)}${C.reset}` : '';
    const key = r.answermapKey ? `${C.dim}→${r.answermapKey}${C.reset}` : `${C.dim}(no key)${C.reset}`;
    console.log(`  ${icon} ${truncate(r.label, 40).padEnd(40)} ${key}${val} ${C.dim}[${r.source} ${r.combined.toFixed(2)}]${C.reset}`);
  }

  writeSummary(summary: Record<string, unknown>) {
    fs.writeFileSync(path.join(this.dir, 'run_summary.json'), JSON.stringify(summary, null, 2));
  }

  writeCaptured(captured: unknown) {
    fs.writeFileSync(path.join(this.dir, 'captured.json'), JSON.stringify(captured, null, 2));
  }

  allRecords() { return this.records; }
  close() { this.jsonl.end(); }
}

function round(n: number) { return Math.round(n * 1000) / 1000; }
function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
