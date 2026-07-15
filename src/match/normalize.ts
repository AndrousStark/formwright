// Text canonicalization shared by every matcher. Kept deliberately conservative so
// exact/alias tiers can fire before any fuzzy scoring.

const ARTICLES = new Set(['the', 'a', 'an', 'of', 'for', 'to', 'your', 'please', 'enter']);

/** Split camelCase / snake_case / kebab-case and lowercase. */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Lowercase, strip punctuation, drop articles, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')      // drop parenthetical asides e.g. "(if any)"
    .replace(/[*:]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !ARTICLES.has(t))
    .join(' ')
    .trim();
}

export function tokens(s: string): string[] {
  return normalize(s).split(/\s+/).filter(Boolean);
}

/** Is this placeholder actually a format hint rather than a label? */
export function isFormatHint(s: string): boolean {
  return /mm.?dd|dd.?mm|yyyy|\be\.?g\.?\b|xx-x|\d{3}.*\d{4}|digits only|format/i.test(s);
}
