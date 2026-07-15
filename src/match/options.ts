// Resolves a desired value to the correct <option>/radio from the CLOSED set scraped
// off the DOM. Deterministic-first cascade; each tier scores against BOTH the option
// value and its visible text, and takes the best.

import * as fuzz from 'fuzzball';
import type { OptionDesc } from '../types.js';
import { thresholds } from '../config.js';

const AFFIRM = new Set(['yes', 'y', 'true', '1', 't', 'checked']);
const NEGATE = new Set(['no', 'n', 'false', '0', 'f', 'none', 'unchecked']);
const ZERO_WORDS = new Set(['none', 'n a', 'na', 'nil', 'zero', '0']);

export interface OptionMatch { option: OptionDesc; strategy: string; score: number; }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function resolveOption(desiredRaw: string, options: OptionDesc[]): OptionMatch | null {
  const desired = norm(desiredRaw);
  if (!desired || options.length === 0) return null;
  const surfaces = (o: OptionDesc) => [norm(o.value), norm(o.text)].filter(Boolean);

  // Tier 1 — exact on value or text
  for (const o of options) if (surfaces(o).includes(desired)) return { option: o, strategy: 'exact', score: 1 };

  // Tier 2 — boolean / enum polarity
  const desiredPol = AFFIRM.has(desired) ? 'aff' : NEGATE.has(desired) ? 'neg' : null;
  if (desiredPol) {
    for (const o of options) {
      const set = surfaces(o);
      const optPol = set.some((s) => AFFIRM.has(s)) ? 'aff' : set.some((s) => NEGATE.has(s)) ? 'neg' : null;
      if (optPol === desiredPol) return { option: o, strategy: 'boolean', score: 0.98 };
    }
  }

  // Tier 3 — numeric / "None"
  if (/^\d+$/.test(desired)) {
    for (const o of options) {
      const set = surfaces(o);
      if (set.some((s) => s === desired || s.split(' ')[0] === desired)) return { option: o, strategy: 'numeric', score: 0.95 };
    }
    if (desired === '0') for (const o of options) if (surfaces(o).some((s) => ZERO_WORDS.has(s))) return { option: o, strategy: 'numeric-zero', score: 0.93 };
  }

  // Tier 4 — acronym / initials (LLC -> Limited Liability Company)
  if (/^[a-z0-9]{2,6}$/.test(desired)) {
    for (const o of options) {
      const initials = norm(o.text).split(' ').filter(Boolean).map((w) => w[0]).join('');
      if (initials && initials === desired.replace(/\s/g, '')) return { option: o, strategy: 'acronym', score: 0.92 };
    }
  }

  // Tier 5 — fuzzy (token_set_ratio) against value AND text, with a runner-up margin
  const ranked = options
    .map((o) => ({ o, score: Math.max(...surfaces(o).map((s) => fuzz.token_set_ratio(desired, s))) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;
  if (top && top.score >= thresholds.optionFuzzy && top.score - second >= thresholds.optionFuzzyMargin) {
    return { option: top.o, strategy: 'fuzzy', score: top.score / 100 };
  }

  return null; // abstain — better an empty flagged field than a wrong confident option
}
