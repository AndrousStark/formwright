// Page-level resolution: rank keys per field, run a greedy assignment that de-conflicts
// shared keys, then apply the combined-score gate (labelConfidence x matchScore) as the
// FINAL authority over fill / flag / skip. Option choice and value formatting are wired in.

import type { FieldDescriptor, FlatAnswers, Resolution, CandidateKey } from '../types.js';
import { thresholds } from '../config.js';
import { normalize } from './normalize.js';
import { scoreLabelToKey } from './score.js';
import { tryCompose, type Composed } from './compose.js';
import { resolveOption } from './options.js';
import { renderValue } from '../format/render.js';

interface Ranked { f: FieldDescriptor; comp: Composed | null; cands: CandidateKey[]; labelNorm: string; }

export function resolvePage(fields: FieldDescriptor[], answers: FlatAnswers): Resolution[] {
  const ranked: Ranked[] = fields.map((f) => {
    const labelNorm = normalize(f.label.name);
    const groupNorm = normalize(f.label.group ?? '');
    const comp = tryCompose(f.label, answers);
    return { f, comp, cands: comp ? [] : rankKeys(labelNorm, groupNorm, answers), labelNorm };
  });

  // Greedy assignment, highest combined first; single-use keys de-conflicted.
  const used = new Set<string>();
  const assigned = new Map<string, CandidateKey>();
  const order = ranked.filter((r) => !r.comp && r.cands.length).sort((a, b) => topCombined(b) - topCombined(a));
  for (const r of order) {
    const pick = r.cands.find((c) => !used.has(c.key));
    if (!pick) continue;
    assigned.set(r.f.uid, pick);
    if (r.f.label.confidence * pick.score >= thresholds.reviewBar) used.add(pick.key);
  }

  return ranked.map((r) => build(r, assigned.get(r.f.uid) ?? null, answers));
}

function rankKeys(labelNorm: string, groupNorm: string, answers: FlatAnswers): CandidateKey[] {
  return answers.scalars
    .map((s) => ({ key: s.key, score: scoreLabelToKey(labelNorm, s.key, groupNorm).score }))
    .filter((c) => c.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

const topCombined = (r: Ranked) => (r.cands[0] ? r.f.label.confidence * r.cands[0].score : 0);

function isBooleanValue(v?: string): boolean {
  // strict yes/no only — 1/0 are ambiguous (could be counts), so never treat them as boolean here
  return v != null && /^(yes|no|y|n|true|false)$/i.test(v.trim());
}

function base(f: FieldDescriptor): Resolution {
  return {
    uid: f.uid, label: f.label.name, labelSource: f.label.source, answermapKey: null,
    source: 'none', matchScore: 0, labelConfidence: f.label.confidence, combined: 0,
    action: 'skipped', status: 'skipped_missing', candidateKeys: [], reason: '',
  };
}

function build(r: Ranked, pick: CandidateKey | null, answers: FlatAnswers): Resolution {
  const f = r.f;
  const res = base(f);

  // Composition path (First + Last -> Full Name). Still gated by label confidence.
  if (r.comp) {
    const combined = f.label.confidence * 0.95;
    res.answermapKey = r.comp.keys.join('+');
    res.source = 'composed';
    res.matchScore = 0.95;
    res.combined = combined;
    res.rawValue = r.comp.value;
    if (combined < thresholds.reviewBar) {
      res.action = 'skipped'; res.status = 'skipped_low_confidence';
      res.reason = 'composition matched but label confidence too low';
      return res;
    }
    res.formattedValue = renderValue(f, r.comp.value);
    res.action = 'filled';
    res.status = combined < thresholds.fillBar ? 'filled_low_confidence' : 'filled';
    res.reason = `composed from ${r.comp.keys.join(' + ')}`;
    return res;
  }

  res.candidateKeys = r.cands.slice(0, 3);

  // A checkbox holds a BOOLEAN — bind it to the best candidate key with a yes/no value and
  // set checked state by polarity (never fill a checkbox from a text-valued key like a carrier).
  if (f.kind === 'checkbox') {
    const bp = r.cands.find((c) => isBooleanValue(answers.value(c.key)));
    if (bp) {
      const combined = f.label.confidence * bp.score;
      res.answermapKey = bp.key; res.matchScore = bp.score; res.combined = combined; res.source = 'boolean';
      if (combined >= thresholds.reviewBar) {
        res.rawValue = answers.value(bp.key);
        res.formattedValue = answers.value(bp.key);   // act.fillCheckbox interprets polarity
        res.action = 'filled';
        res.status = combined < thresholds.fillBar ? 'filled_low_confidence' : 'filled';
        res.reason = 'checkbox bound to boolean key';
        return res;
      }
    }
    res.reason = 'checkbox: no confident boolean key';
    return res;   // skipped — attestation checkboxes are handled by the orchestrator
  }

  if (!pick) { res.reason = 'no answermap key clears the floor'; return res; }

  const raw = answers.value(pick.key) ?? '';
  const matchScore = pick.score;
  const combined = f.label.confidence * matchScore;
  const margin = matchScore - (r.cands[1]?.score ?? 0);
  res.answermapKey = pick.key;
  res.matchScore = matchScore;
  res.combined = combined;
  res.source = matchScore >= 0.99 ? 'exact' : 'fuzzy';

  if (combined < thresholds.reviewBar) {
    res.action = 'skipped'; res.status = 'skipped_low_confidence';
    res.reason = `combined ${combined.toFixed(2)} < reviewBar ${thresholds.reviewBar}`;
    return res;
  }
  const lowConf = combined < thresholds.fillBar || margin < thresholds.marginMin;

  // Enumerated control -> resolve an option from the closed set.
  if (f.options && f.options.length && (f.kind === 'select' || f.kind === 'radio' || f.kind === 'combobox')) {
    const om = resolveOption(raw, f.options);
    if (!om) {
      res.action = 'flagged'; res.status = 'flagged_option_no_match';
      res.reason = `no option matched "${raw}"`;
      return res;
    }
    res.chosenOption = om.option; res.optionStrategy = om.strategy;
    res.action = 'filled'; res.status = lowConf ? 'filled_low_confidence' : 'filled';
    res.reason = `option via ${om.strategy}`;
    return res;
  }

  // Free-value control -> deterministic format.
  res.rawValue = raw;
  res.formattedValue = renderValue(f, raw);
  res.action = 'filled';
  res.status = lowConf ? 'filled_low_confidence' : 'filled';
  res.reason = lowConf ? `low confidence (combined ${combined.toFixed(2)})` : 'mapped';
  return res;
}
