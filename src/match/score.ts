// Scores how well a form-field label maps to an answermap key. Combines exact /
// containment / concept-alias / fuzzy, then applies a qualifier penalty so that
// "current-term" and "prior-term" keys don't steal policy-level labels (and vice versa).

import * as fuzz from 'fuzzball';
import type { ResolveSource } from '../types.js';
import { humanizeKey, normalize, tokens } from './normalize.js';
import { sharedConcept, hasAny, CURRENT_MARKERS, PRIOR_MARKERS, SPECIFIC_MARKERS } from './concepts.js';

export interface KeyScore { score: number; source: ResolveSource; }

export function scoreLabelToKey(labelNorm: string, keyRaw: string, groupNorm = ''): KeyScore {
  const keyNorm = normalize(humanizeKey(keyRaw));
  if (!labelNorm || !keyNorm) return { score: 0, source: 'none' };

  let base = 0;
  let source: ResolveSource = 'none';

  if (labelNorm === keyNorm) { base = 1.0; source = 'exact'; }
  else {
    if (containsWord(labelNorm, keyNorm) || containsWord(keyNorm, labelNorm)) { base = 0.9; source = 'contains'; }
    if (sharedConcept(labelNorm, keyNorm) && 0.9 > base) { base = 0.9; source = 'alias'; }
    const fz = fuzz.token_set_ratio(labelNorm, keyNorm) / 100;
    if (fz > base) { base = fz; source = 'fuzzy'; }
  }

  // Section context (e.g. a "Prior Policy" fieldset) also carries current/prior qualifiers.
  const penalty = qualifierPenalty(`${labelNorm} ${groupNorm}`.trim(), keyNorm);
  return { score: Math.max(0, base - penalty), source };
}

/** Whole-token containment (avoids "state" matching "real estate"). */
function containsWord(hay: string, needle: string): boolean {
  if (needle.length < 3) return false;
  return (' ' + hay + ' ').includes(' ' + needle + ' ');
}

function qualifierPenalty(labelNorm: string, keyNorm: string): number {
  const labelHasCurrent = hasAny(labelNorm, CURRENT_MARKERS);
  const labelHasPrior = hasAny(labelNorm, PRIOR_MARKERS);
  const keyHasPrior = hasAny(keyNorm, PRIOR_MARKERS);

  let penalty = 0;
  const lt = tokens(labelNorm);
  for (const t of tokens(keyNorm)) {
    if (!SPECIFIC_MARKERS.includes(t)) continue;
    if (lt.includes(t)) continue;                                   // label has it too — fine
    if ((t === 'current' || t === 'expiring') && labelHasCurrent) continue; // class-equivalent
    if ((t === 'prior' || t === 'previous') && labelHasPrior) continue;
    penalty += t === 'term' ? 0.1 : 0.12;
  }
  // Strong separation: a prior-term key must not grab a non-prior label.
  if (keyHasPrior && !labelHasPrior) penalty += 0.15;
  if (labelHasPrior && !keyHasPrior) penalty += 0.1;
  return Math.min(penalty, 0.5);
}
