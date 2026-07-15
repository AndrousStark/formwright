// Field composition: deriving one field's value from several PRESENT answermap keys
// (e.g. First + Last -> a single "Full Name" field). This is lossless derivation, never
// generation — if a required part is missing, we abstain rather than partial-compose.

import type { FlatAnswers, LabelInfo } from '../types.js';
import { normalize } from './normalize.js';
import { scoreLabelToKey } from './score.js';

export interface Composed { value: string; keys: string[]; id: string; }

/** Best scalar key whose humanized name matches a concept phrase, above a floor. */
function bestKeyFor(answers: FlatAnswers, conceptPhrase: string, floor = 0.82): string | undefined {
  const target = normalize(conceptPhrase);
  let best: { key: string; score: number } | undefined;
  for (const s of answers.scalars) {
    const { score } = scoreLabelToKey(target, s.key);
    if (score >= floor && (!best || score > best.score)) best = { key: s.key, score };
  }
  return best?.key;
}

export function tryCompose(label: LabelInfo, answers: FlatAnswers): Composed | null {
  // Match on a lightly-cleaned label (NOT article-stripped) so multi-word phrases like
  // "name of contact" / "person for this submission" can actually fire.
  const light = label.name.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Full personal-name field (contact person / full name), but NOT a business/insured name.
  const isPersonName = /\b(full name|contact (person|name)|your name|point of contact|primary contact|authorized representative|submitter|person (for|completing)|name of (contact|applicant|owner|representative))\b/.test(light);
  const isBusiness = /\b(insured|business|legal|company|firm|organization|entity|dba|trade)\b/.test(light);
  if (isPersonName && !isBusiness) {
    const first = bestKeyFor(answers, 'first name');
    const last = bestKeyFor(answers, 'last name');
    if (first && last) {
      return { value: `${answers.value(first)} ${answers.value(last)}`.trim(), keys: [first, last], id: 'full-name' };
    }
  }
  return null;
}
