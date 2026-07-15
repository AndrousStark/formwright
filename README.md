# Carrier Form Autofill Agent

A generalizable AI agent that fills a **multi-page insurance web form it has never seen**
from an applicant JSON (`answermap.json`) — no per-form hardcoding, no pre-written
selectors. Built for the case that matters: running **unmodified on a third, hidden form**.

> Full design rationale (perception, mapping cascade, algorithms, prompting, cost, failure
> analysis) is in **[`docs/DESIGN.html`](docs/DESIGN.html)** — open it in a browser.

## Results on the two sample forms

| Form | Fields filled | Verified | Hallucinated | Outcome |
|------|--------------|----------|--------------|---------|
| `form_a` (Meridian) | 24 / 24 | 24 | **0** | ✅ completed |
| `form_b` (Pacific Shield) | 31 / 32 | 31 | **0** | ✅ completed (`County` correctly abstained) |

Both captured confirmation JSONs match ground truth exactly — including the hard cases:
LLC→"Limited Liability Company" (acronym), First+Last→"Full Name" (composition),
`(619) 555-0142`→`6195550142` (digits-only), ISO→`MM/DD/YYYY` (date reformat), 3 repeating
class-code rows, `No`→`N` (boolean), semantic claim-count select, and conditional reveals.
Run traces and captured JSON for both are in **[`artifacts/`](artifacts/)**.

## Install & run

```bash
npm install
npx playwright install chromium

# run against a sample (local path or URL)
npx tsx src/index.ts --form forms/form_a.html --answers answermap.json --out runs
npx tsx src/index.ts --form forms/form_b.html --answers answermap.json --out runs

# a hidden form later — SAME command, just a new --form
npx tsx src/index.ts --form <url-or-path> --answers answermap.json --out runs

npm test          # 14 unit tests for the pure transforms
npm run typecheck # tsc --noEmit
```

**No API key is required** — the deterministic core passes both sample forms on its own.
Setting `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`, see `.env.example`) enables the **LLM
fallback tier**, which only fires for fields the deterministic cascade abstains on (useful
for an unfamiliar form's harder labels). It is grounded so it can never invent a key/option.

### Flags
`--headed` show the browser · `--no-llm` force deterministic only · `--no-certify` don't
auto-check attestation boxes · `--out <dir>` artifact directory (default `runs/`).

### Artifacts per run (`runs/<run-id>/`)
`decisions.jsonl` (one record per field: label, binding, chosen key, candidates+scores,
value, verify result, reason) · `run_summary.json` (counts, resolution mix, cost) ·
`captured.json` (the confirmation-page data) · `trace.zip` (Playwright trace) · `page_*.png`.

## How it works (per page)

```
perceive → presence gate → map (exact→alias→fuzzy→embed→LLM) → format → act → read-back verify
         → handle repeating rows / conditional reveals → classify transition → next | done | flag
```

- **Perception** — enumerate visible controls, compute each one's *accessible name*
  (resolving `label[for]`, aria, wrapping labels, and DOM proximity), stamp a code-owned
  handle. No selector the form defines is ever hardcoded.
- **Mapping** — a cheap-first cascade: exact → domain alias/concept table → fuzzy
  (`fuzzball`) → grounded LLM (a local-embedding tier sits between fuzzy and the LLM in the
  design; it is an optional extension, not required for the samples). `labelConfidence ×
  matchScore` is the final gate; a greedy assignment de-conflicts shared keys, and a
  qualifier penalty keeps current-term vs prior-term keys from stealing each other.
- **Formatting** — deterministic renderers keyed off the control's `type`/`pattern`/
  `placeholder` (dates, phone, EIN). The LLM never formats a value.
- **Options** — closed-set cascade (exact → boolean → numeric → acronym → fuzzy) against
  both the option value and its visible text.
- **Missing/ambiguous** — abstain and report, never guess. `County` (no answermap key) is
  left blank and flagged. Only lossless derivations from present data are allowed.
- **Navigation** — `classifyTransition` races confirmation/error markers and a
  step-signature diff, so it never assumes the URL changes.

## Cost & latency

Deterministic core: **$0, ~6s/form**, 0 LLM calls (the two samples resolve entirely on
exact/fuzzy/alias tiers). With the LLM tier on, expect **~1 batched call per page** for the
residual ambiguous fields (~$0.01/form on Haiku). Formatting and the missing-data gate stay
deterministic, so cost reduction never trades against the no-hallucination requirement.

## What breaks first (honest)

CAPTCHA / anti-bot and cross-origin iframes (detected and flagged, never faked);
signal-less ambiguous date formats and canvas/e-sign fields (flagged). See `docs/DESIGN.html`
§14 for the full residual-failure analysis.

## Project layout

```
src/
  index.ts            CLI
  orchestrator.ts     per-page loop: repeating, conditional reveals, advance
  config.ts           all thresholds (one source of truth)
  answers.ts          load + flatten answermap
  perceive / act / navigate   (src/browser)   DOM perception, fill+verify, transitions
  match/              normalize, concepts (WC domain), score, options, compose, resolve
  format/render.ts    deterministic value formatting
  llm/                provider-agnostic client + grounded batched mapper (optional)
  util/log.ts         JSONL decision records + run summary
tests/agent.test.ts   unit tests for the pure transforms
docs/DESIGN.html      the design document
```
