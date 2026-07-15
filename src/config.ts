// Single source of truth for every threshold and budget. Calibrated on the two
// sample forms; biased toward abstention (a flagged field is recoverable, a wrong
// confident fill is not). All numbers are quoted by name elsewhere — no magic inline.

export const thresholds = {
  // Combined-score gate (combined = labelConfidence * matchScore) — the FINAL authority.
  fillBar: 0.72,        // >= fillBar            -> fill
  reviewBar: 0.50,      // reviewBar..fillBar     -> fill + flag (low confidence)
  marginMin: 0.08,      // top1 - top2 below this -> ambiguous, downgrade to flag

  // Per-tier auto-candidate bars (a tier only proposes a candidate; the gate decides).
  fuzzyCommit: 0.86,    // token_set_ratio/100
  embedCommit: 0.84,
  embedMargin: 0.06,
  embedAbstainFloor: 0.40,

  // Option matching (0..100 fuzzy scale unless noted).
  optionFuzzy: 80,
  optionFuzzyMargin: 8,
  optionEmbed: 0.82,

  // Playwright timeouts — aggressive so one bad field can't burn the 30s default.
  actionTimeoutMs: 4000,
  transitionCeilingMs: 9000,
  settleMs: 500,

  // Budgets / loop guards.
  maxAttemptsPerField: 2,
  maxRescansPerPage: 4,
  maxNextPerPage: 3,
  maxPages: 15,
  maxAddRows: 25,
} as const;

export const models = {
  anthropic: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
  openai: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  temperature: 0,
} as const;
