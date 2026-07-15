<h1 align="center">🧭 FormWright</h1>

<p align="center">
  <em>The AI agent that fills a form it has never seen.</em>
</p>

<p align="center">
  <strong>FormWright fills a multi-page insurance form it has never seen — from one applicant JSON — with zero per-form hardcoding and zero hallucinated answers.</strong>
</p>

<p align="center">
  <img alt="Node" src="https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white">
  <img alt="Playwright" src="https://img.shields.io/badge/Playwright-browser%20automation-2EAD33?logo=playwright&logoColor=white">
  <img alt="Tests" src="https://img.shields.io/badge/tests-14%20passing-brightgreen">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue">
  <img alt="No hardcoded selectors" src="https://img.shields.io/badge/selectors-none%20hardcoded-8A2BE2">
  <img alt="Hallucinations" src="https://img.shields.io/badge/hallucinations-0-critical">
  <a href="https://github.com/AndrousStark/formwright/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/AndrousStark/formwright/actions/workflows/ci.yml/badge.svg"></a>
</p>

<p align="center">
  <a href="https://androusstark.github.io/formwright/"><b>🌐&nbsp;Live&nbsp;site</b></a> &nbsp;·&nbsp;
  <a href="https://androusstark.github.io/formwright/DESIGN.html"><b>📐&nbsp;Design&nbsp;document</b></a> &nbsp;·&nbsp;
  <a href="#-results--the-generalization-gauntlet"><b>🏆&nbsp;Results</b></a>
</p>

<p align="center"><strong>by Aniruddh Atrey</strong></p>

---

A Node.js/TypeScript agent that opens a **multi-page insurance web form it has never seen**, reads an applicant profile from a single `answermap.json`, and fills every field it can justify — resolving each control's accessible name, matching it to your data, formatting the value, typing it, and re-reading the DOM to prove it landed. There are **no hardcoded selectors, ids, or label strings** anywhere: the same code that aces the provided samples is the code that runs against a hidden, unseen form. And it is built to a single non-negotiable rule — **when it isn't sure, it abstains and flags for a human instead of inventing a value.**

Built for the **Elasa.ai** ML-engineer take-home, whose graded run is a hidden third form.

### ✨ Highlights

- 🚫 **Zero hardcoding** — no form-specific selectors, ids, or label strings; the unseen form runs the exact same code path as the samples.
- 🛑 **Zero hallucinated fills** across every test form — the agent abstains and flags rather than inventing a value.
- 🧠 **Deterministic-first, LLM-as-last-resort** — a cheap-to-expensive matching cascade that passes every test with **$0 and zero LLM calls**.
- 🔤 **Accessible-name resolution from anything** — `aria-labelledby`, `aria-label`, `<label for>`, wrapping labels, `<th>` row/column headers, adjacent `<span>` labels, and geometric proximity.
- ✅ **Read-back verification** — every fill is confirmed by re-reading the DOM before the agent moves on.
- 🔑 **No API key required** — the deterministic core is fully self-sufficient; the optional grounded-LLM tier is strictly opt-in.
- 🌐 **Proven cross-domain** — completes not just the insurance samples but a live public form on the open internet.

---

## 📋 Table of Contents

- [The problem & why it's genuinely hard](#-the-problem--why-its-genuinely-hard)
- [Results — the generalization gauntlet](#-results--the-generalization-gauntlet)
  - [Adversarial testing: 8 bugs found and fixed](#-adversarial-testing-8-bugs-found-and-fixed)
  - [Tested on a live public form](#-tested-on-a-live-public-form)
- [How it works](#-how-it-works)
  - [The per-page loop](#the-per-page-loop)
  - [The tiered cascade & the combined-score gate](#the-tiered-cascade--the-combined-score-gate)
  - [How it generalizes](#how-it-generalizes)
- [Quick start](#-quick-start)
  - [Flags & environment](#flags--environment)
  - [Artifacts per run](#artifacts-per-run)
  - [Testing](#testing)
- [Project structure](#-project-structure)
- [Design decisions & honest tradeoffs](#-design-decisions--honest-tradeoffs)
- [What breaks first](#-what-breaks-first-honest-failure-modes)
- [FAQ / interview defense](#-faq--interview-defense)
- [How this was built](#-how-this-was-built)
- [About the author](#-about-the-author)

---

## 🎯 The problem & why it's genuinely hard

Autofilling *a* form is easy — you inspect it once, hardcode the selectors, and ship. That approach scores zero here, because the run that actually counts is a form **nobody has seen at build time**. The challenge is generalization, not memorization:

- **The real test is an unseen third form.** Two sample forms are provided to develop against; the graded run is hidden. Anything tuned to a specific field id, label, or layout is worthless the moment the DOM changes. The agent must reason about *what a control means*, not *where it is*.
- **No per-form hardcoding is allowed.** No selector cheat-sheets, no id lookups, no "if label === 'FEIN'" branches. Every field must be understood from first principles at runtime — by resolving its accessible name from `aria-labelledby`, `aria-label`, `<label for>`, wrapping labels, table headers, adjacent `<span>` text, or sheer geometric proximity.
- **Real forms are adversarial by nature.** Acronyms (`LLC` → *Limited Liability Company*), composed fields (first + last → a single *Full Name*), reformatted values (ISO dates, digits-only phones), repeating rows, conditional reveals, and unusual synonyms (*Business Structure*, *Municipality*, *Point of Contact*) all have to be handled from meaning alone.
- **Being wrong is worse than being blank.** An insurance application filled with a confident-but-wrong value is a liability. A field with no supporting data — say a *County* the applicant never provided — must be **left empty and flagged**, never guessed. Precision beats coverage.

The result is an agent that treats every page as a fresh perception problem, prefers cheap deterministic reasoning over expensive guessing, and would rather raise its hand than make something up.

---

## 🏆 Results — the generalization gauntlet

The agent was run against four multi-page forms it had never seen — two provided samples, one adversarial form purpose-built to break it, and a **live, public form on the open internet**. Every field is filled **only** after a read-back verification confirms the value landed in the DOM. Across all four forms, the hallucination count is the number that matters most:

| Form | Fields | Verified | Hallucinated | Outcome |
|---|---:|---:|:---:|:---|
| **`form_a`** — Meridian *(provided sample)* | 24 | **24 / 24** | **0** | ✅ COMPLETED |
| **`form_b`** — Pacific Shield *(provided sample)* | 32 | **31 / 32** | **0** | ✅ COMPLETED · `County` correctly abstained |
| **`form_hard`** — adversarial *(built to break the agent)* | 29 | **28 / 29** | **0** | ✅ COMPLETED · `County` correctly abstained |
| **`selenium.dev`** — live public web form *(unseen, on the internet)* | live | mapped & submitted | **0** | ✅ COMPLETED · 8 no-data fields abstained, disabled/readonly skipped |

> **Zero hallucinated fills. Every form. Including the adversarial one and a live form on the public internet.**
> When the agent isn't sure, it leaves the field blank and flags it for human review — it never invents a value.

**What each test proves:**

- **`form_a` — the baseline.** A clean 24/24 confirms the deterministic core (perceive → gate → map → format → act → verify) fills a real multi-page insurance form end-to-end, with every value read back from the DOM.
- **`form_b` — the transformations.** This is where the *formatting* and *semantic* layers earn their keep. In one run the agent handled an acronym expansion (`LLC` → **"Limited Liability Company"**), name composition (`First` + `Last` → a single **"Full Name"** field), digits-only normalization (`"(619) 555-0142"` → **`6195550142`**), an ISO-to-`MM/DD/YYYY` date reformat, **3 repeating class-code rows**, a `"No"` → `"N"` mapping, a semantic claim-count `<select>`, and conditional reveals — while **correctly abstaining on `County`**, for which the applicant JSON had no key.
- **`form_hard` — the adversary.** A form engineered specifically to defeat label resolution and repeating-row logic (details below). It surfaced **8 real bugs, all now fixed** — and after those fixes, still landed **28/29 with zero hallucinations**.
- **`selenium.dev` — cross-domain generalization, live.** Not an insurance form and not a fixture — Selenium's official public web-form on the open internet. The agent correctly mapped **Text**, **Password**, **Textarea**, and **Dropdown (`<select>`)** inputs, **abstained on 8 fields** with no matching data, **skipped disabled and read-only** inputs, and submitted via **real navigation**. Proof the approach isn't overfit to the take-home's domain.

### 🧨 Adversarial testing: 8 bugs found and fixed

`form_hard` was built to attack every assumption the agent could be making. It deliberately labeled fields via `aria-labelledby`, `aria-label`, `<span class="lab">` adjacency, `<th scope="row">` table labels, and `<th>` column headers; hid a **"digits only"** phone hint in a *detached* `aria-describedby`; rendered a **no-add-button, fixed class-code grid description-first**; used a **`DD/MM/YYYY`** date; gated a field behind a **checkbox-conditional reveal**; and renamed common concepts to unusual synonyms — **"Business Structure"**, **"Municipality"**, **"Point of Contact"**.

It worked: the form exposed **8 genuine defects**. All were fixed, and the fixes generalize beyond this one form.

| # | Trap the form set | Bug it exposed | Fix |
|:--:|---|---|---|
| 1 | Parenthetical acronym `(FEIN)` in a label | Normalizer **stripped the parenthetical**, discarding the strongest match token | Preserve parenthetical acronyms through normalization |
| 2 | Labels via `<span>` / `<div>` adjacency | Non-`<label>` text labels got **too-low confidence** to clear the gate | Raise confidence for validated `<span>`/`<div>` label bindings |
| 3 | Field named **"Business Structure"** | The business-description **concept was too narrow** to match the synonym | Broaden the business-structure concept in the alias table |
| 4 | `<th scope="row">` table labels | **No `<th>` label resolution** — table-scoped fields went unlabeled | Resolve accessible names from table row/column `<th>` headers |
| 5 | **Detached** `aria-describedby` "digits only" hint | Formatting hint was **ignored**, so the phone wasn't normalized | Follow detached `aria-describedby` references for format hints |
| 6 | City field labeled **"Municipality"** | **Missing city synonym** — no mapping to the city concept | Add "Municipality" (and kin) to the city concept |
| 7 | No-add-button, fixed class-code grid | **Undetected repeating grid** — every row mis-filled from scalar keys | Detect no-add-button repeating grids; stop scalar bleed across rows |
| 8 | Boolean checkbox next to a text-ish key | Checkbox **bound to a text key** instead of a yes/no key | Constrain boolean/checkbox bindings to yes/no-typed keys |

> A separate **6-agent adversarial code-review panel** had already caught a critical **cross-page UID-collision** bug before this run — so the fixes above are the *second* wave of adversarial hardening, not the first.

### 🌐 Tested on a live public form

Fixtures can be gamed; a live site cannot. The agent was pointed at **Selenium's official web-form at `selenium.dev`** — an unseen, real page on the public internet — with **no per-form changes**.

It correctly identified and mapped the **Text input**, **Password**, **Textarea**, and **Dropdown (`<select>`)** controls; **abstained on 8 fields** that had no corresponding data in the applicant JSON; **skipped the disabled and read-only** inputs entirely; and **submitted through real browser navigation** — reaching the confirmation page.

**Zero hallucinated fills, on a live form, in a domain it was never built for.**

---

## 🧭 How It Works

The agent treats every form as **unseen**. There are no per-form selectors, ids, or label strings anywhere in the code — instead, each page is driven through a fixed **deterministic-first pipeline**. Cheap, certain methods run first; the (optional) LLM is a last resort; and when nothing clears the bar, the field is **abstained** (left blank and flagged) rather than guessed.

### The per-page loop

```
                        ┌────────────────────────────────────────────────────────┐
                        │                   ONE FORM PAGE                          │
                        └────────────────────────────────────────────────────────┘
                                              │
                                              ▼
   ┌──────────────┐   Enumerate every visible control. Resolve its accessible NAME from
   │  1. PERCEIVE │   aria-labelledby · aria-label · label[for] · wrapping <label> ·
   └──────┬───────┘   <th> row/col headers · <span class=label> adjacency · geometry.
          │           Stamp a code-owned integer handle on each control.
          ▼
   ┌──────────────┐   Is there ANY answermap key that could plausibly supply this field?
   │ 2. PRESENCE  │   No key in scope  ──────────────►  ABSTAIN (blank + flag) ─┐
   │    GATE      │                                                             │
   └──────┬───────┘                                                             │
          │ yes                                                                 │
          ▼                                                                     │
   ┌──────────────┐   Cheap-first cascade, stop at first confident hit:         │
   │  3. MAP       │   exact ─► domain alias/concept ─► fuzzy ─► [embeddings] ─► │
   │  (cascade)    │   grounded LLM.  Greedy de-conflict of shared keys +        │
   └──────┬───────┘   qualifier penalty (current-term vs prior-term).           │
          │           combined = labelConfidence × matchScore                    │
          │           combined < threshold ────────────►  ABSTAIN ──────────────┤
          ▼ combined ≥ threshold                                                 │
   ┌──────────────┐   Deterministic renderers keyed off type / pattern /         │
   │  4. FORMAT    │   placeholder / aria-describedby.  digits-only phone,        │
   └──────┬───────┘   date reformat, acronym expansion, boolean → Y/N …          │
          ▼                                                                       │
   ┌──────────────┐   Playwright fill / select / check — via the OWNED handle,    │
   │  5. ACT       │   never a re-queried selector.                              │
   └──────┬───────┘                                                              │
          ▼                                                                       │
   ┌──────────────┐   Re-read the DOM. Assert the value actually landed.          │
   │ 6. READ-BACK │   Mismatch ──────────────────────►  flag for review ─────────┤
   │    VERIFY    │                                                              │
   └──────┬───────┘                                                              │
          ▼                                                                       │
   ┌──────────────┐   Handle repeating rows (incl. no-add-button fixed grids)     │
   │ 7. REPEATING │   and conditional reveals unlocked by a prior answer, then    │
   │  + REVEALS   │   loop back into PERCEIVE for the newly-visible controls.     │
   └──────┬───────┘                                                              │
          ▼                                                                       │
   ┌──────────────┐   Confirmation / error markers + step-signature diff.         │
   │ 8. CLASSIFY  │   NEVER assumes the URL changed. Advance or stop.             │
   │  TRANSITION  │                                                              │
   └──────┬───────┘                                                              │
          │                                                                       │
          ▼                                                                       │
   next page ──────────────────────────────────────────────────────────────────►┘
                                                                        (all abstentions
                                                                         recorded, never faked)
```

Every decision along the way is written to `decisions.jsonl` — one record per field, with its label, binding method, chosen key, the full candidate-key scoreboard, the value, and the read-back verify result.

### The tiered cascade & the combined-score gate

Mapping a control to an answer is a **cost-ordered cascade** that short-circuits on the first confident match, so most fields never touch anything expensive:

1. **Exact** — normalized label equals a key. Free, instant.
2. **Domain alias / concept table** — hand-curated insurance concepts (e.g. *Business Structure* ≈ *entity type*, *Municipality* ≈ *city*).
3. **Fuzzy** — `fuzzball` token matching for near-misses and typos.
4. **Embeddings** *(optional, off by default)* — local sentence-embeddings for semantically distant phrasings.
5. **Grounded LLM** *(optional, last resort)* — one batched call per page. It may only choose an **existing** answermap key (or `no_answer`) and an **existing** option; every pick is re-checked in code.

The gate that authorizes a fill is deliberately conservative:

> **combined = labelConfidence × matchScore**, and a field is filled **only if `combined` clears the threshold.**

Because label confidence and match score *multiply*, a shaky label reading can't be rescued by a lucky match (or vice-versa) — both halves have to be strong. A **greedy assignment** step de-conflicts keys that two fields both want, and a **qualifier penalty** prevents near-synonym keys like *current-term* and *prior-term* from stealing each other. Anything that fails to clear the bar — or has no key in scope at all — is abstained: left blank, flagged, and logged. Crucially, **formatting and the missing-data gate stay deterministic even when the LLM tier is on**, so cost never trades against the no-hallucination guarantee.

### How it generalizes

Each generalization axis below is backed by a concrete case from the test gauntlet (`form_a` Meridian, `form_b` Pacific Shield, `form_hard` adversarial, and a live public form at selenium.dev) — every one passed with **zero hallucinated fills**.

| Generalization axis | What the agent handles | Concrete example from the tests |
|---|---|---|
| **Label binding — ARIA** | `aria-labelledby` / `aria-label` resolution | `form_hard` labeled controls via `aria-labelledby` and `aria-label` with no visible `<label>` — resolved correctly |
| **Label binding — table `<th>`** | `<th scope=row>` row headers **and** `<th>` column headers | `form_hard`'s `<th scope=row>` and column-header class-code grid; drove a dedicated table-`<th>` resolver (added after this form exposed its absence) |
| **Label binding — span/div** | `<span class="label">` adjacency, `<span class="lab">` variants | `form_hard`'s `<span class="lab">` labels — a fix raised their confidence after they initially scored too low |
| **Label binding — proximity** | Geometric proximity when no markup ties label to control | Fallback used across forms where a control has no programmatic label association |
| **Option matching — acronym** | Acronym ⇄ expansion | `form_b`: `LLC` → **"Limited Liability Company"**. (`form_hard` also forced a normalize fix so `(FEIN)` parentheticals stopped being stripped) |
| **Option matching — boolean** | Yes/No and checkbox semantics bound to a yes/no key | `form_b`: `"No"` → **`N`**; `form_hard` fixed a checkbox that was binding to a *text* key instead of a *yes/no* key |
| **Option matching — semantic** | Meaning-based `<select>` choice | `form_b`: a semantic claim-count `<select>` mapped by concept, not string |
| **Composition** | Multiple keys composed into one field | `form_b`: `First` + `Last` → single **"Full Name"** |
| **Date formatting** | Reformat to the field's expected pattern (ISO, DD/MM/YYYY, …) | `form_b`: ISO → **`08/01/2026`**; `form_hard`: a **DD/MM/YYYY** target rendered correctly |
| **Phone formatting** | Digits-only rendering, incl. hints in detached nodes | `form_b`: `"(619) 555-0142"` → **`6195550142`**; `form_hard`: a **detached `aria-describedby`** "digits only" hint that was initially ignored, then honored |
| **EIN / identifier formatting** | Type/pattern-keyed identifier rendering | `form_hard`'s `(FEIN)` field — fixed so the acronym in parentheses survives normalization |
| **Repeating rows** | Multiple class-code rows; **no-add-button fixed grids**; any column order | `form_b`: 3 repeating class-code rows; `form_hard`: a **no-add-button, description-first** fixed grid — a new detector stopped it mis-filling every row from scalar keys |
| **Conditional reveals** | Fields unlocked by a prior answer / checkbox | `form_b` conditional reveals; `form_hard`'s **checkbox-conditional** reveal, re-perceived after the trigger |
| **Missing-data abstention** | No matching key ⇒ blank + flagged, never faked | `"County"` correctly **abstained** on both `form_b` and `form_hard`; the live selenium.dev form **abstained on 8 unmatched fields** and **skipped disabled/readonly inputs** |

---

## 🚀 Quick start

**Requirements:** Node 20+. No API key required — the deterministic core passes every test on its own.

```bash
# 1. Install dependencies and the Chromium browser Playwright drives
npm install && npx playwright install chromium

# 2. Run against a bundled sample form
npx tsx src/index.ts --form forms/form_a.html --answers answermap.json --out runs

# 3. Run against any form — local file OR a live URL
npx tsx src/index.ts --form <url-or-path> --answers answermap.json --out runs
```

That's it. The agent perceives the page, maps each control to your `answermap.json`, fills and verifies every value, abstains on anything it isn't sure of, and writes a full audit trail to `runs/<id>/`.

### Flags & environment

| Flag | Effect |
|------|--------|
| `--headed` | Run with a visible browser window instead of headless (useful for watching / debugging). |
| `--no-llm` | Disable the optional LLM fallback tier entirely. The deterministic core still completes every bundled form. |
| `--no-certify` | Don't auto-check attestation / certification checkboxes (the agent otherwise ticks them, with no applicant data involved, so a gated form can submit). |
| `--out <dir>` | Directory to write per-run artifacts into (default: `runs`). |

| Env var | Effect |
|---------|--------|
| `ANTHROPIC_API_KEY` | Enables the optional grounded LLM fallback tier via **Anthropic Haiku**. |
| `OPENAI_API_KEY` | Enables the optional grounded LLM fallback tier via **OpenAI**. |

> Both keys are strictly optional. When neither is set, the agent runs at **$0 / ~6s per form / 0 LLM calls**. When a key is present, the LLM is invoked at most once per page (~1 batched call), grounded so it can only choose an existing answermap key or an existing option — it can never invent a value.

### Artifacts per run

Every run writes a self-contained, reviewable bundle to `runs/<id>/`:

| File | Contents |
|------|----------|
| `decisions.jsonl` | One record **per field**: label, binding method, chosen key, candidate keys + scores, value, verify result, and the human-readable reason. The full "why" behind every fill and every abstain. |
| `run_summary.json` | Aggregate counts, resolution-tier mix (exact / alias / fuzzy / embeddings / LLM), and cost. |
| `captured.json` | The data read back off the confirmation page. |
| `trace.zip` | Full Playwright trace — open with `npx playwright show-trace`. |
| `page_*.png` | Screenshots captured per page. |

### Testing

```bash
npm test           # 14 unit tests
npm run typecheck  # tsc --noEmit — clean, zero errors
```

The unit suite (**14 passing**) covers normalization, concept matching, scoring/gating, formatting, and composition. Beyond unit coverage, the agent is validated end-to-end on **four full forms** — the "generalization gauntlet" — all with **zero hallucinated fills**:

| Form | Result | What it exercises |
|------|--------|-------------------|
| `form_a` (Meridian) | ✅ **24/24** filled & verified | Baseline provided sample |
| `form_b` (Pacific Shield) | ✅ **31/32** filled & verified; `County` correctly abstained | Acronym expansion, name composition, digits-only phone, date reformat, 3 repeating rows, semantic `<select>`, conditional reveals |
| `form_hard` (adversarial) | ✅ **28/29** filled; `County` abstained | `aria-labelledby` / `aria-label` / `<span class="lab">` / `<th>` labels, detached `aria-describedby` hints, no-add-button grid, DD/MM/YYYY dates, unusual synonyms — exposed **8 real bugs, all fixed** |
| Live `selenium.dev` web-form | ✅ **Completed** on the open internet | Text/Password/Textarea/Dropdown mapping, abstained on 8 fieldless inputs, skipped disabled & readonly, submitted via real navigation |

---

## 📁 Project structure

```text
.
├── src/
│   ├── index.ts              # CLI entrypoint — arg parsing, wiring
│   ├── orchestrator.ts       # Per-page pipeline loop (perceive→gate→map→format→act→verify→transition)
│   ├── config.ts             # Confidence / match thresholds and tunables
│   ├── answers.ts            # Loads & indexes answermap.json
│   ├── browser/
│   │   ├── perceive.ts       # Enumerate controls, resolve accessible names, stamp owned handles
│   │   ├── act.ts            # Playwright fill / select / check via the owned handle
│   │   └── navigate.ts       # Page-transition classification (confirmation/error, step-signature diff)
│   ├── match/
│   │   ├── normalize.ts      # Label/text normalization (acronyms, punctuation, casing)
│   │   ├── concepts.ts       # Domain alias / concept table (synonyms → canonical fields)
│   │   ├── score.ts          # labelConfidence × matchScore scoring + gate
│   │   ├── options.ts        # <select>/radio option matching
│   │   ├── compose.ts        # Composed values (e.g. First + Last → Full Name)
│   │   └── resolve.ts        # Cheap-first cascade + greedy de-conflicting assignment
│   ├── format/
│   │   └── render.ts         # Deterministic renderers (dates, digits-only, casing) keyed off type/pattern/placeholder
│   ├── llm/
│   │   ├── client.ts         # Grounded LLM transport via fetch (Anthropic Haiku / OpenAI, no SDK)
│   │   └── mapper.ts         # Constrains the LLM to existing keys/options; cross-checks every choice
│   └── util/
│       └── log.ts            # Structured decision logging
├── tests/
│   └── agent.test.ts         # Unit test suite
├── forms/                    # Provided sample forms (form_a, form_b)
├── test-forms/               # Adversarial form (form_hard) + a live-form answermap
├── artifacts/                # Committed run outputs for form_a / form_b / form_hard
├── docs/
│   └── DESIGN.html           # Full design document
└── answermap.json            # Sample applicant data
```

---

## 🧠 Design decisions & honest tradeoffs

This agent makes a handful of load-bearing bets. Each one is a deliberate tradeoff, not a default — here is what we chose, and what we gave up to get it.

**1. Deterministic-first, LLM-as-last-resort.** The mapping pipeline is a **cheap-first cascade**: `exact → domain alias/concept table → fuzzy → [optional embeddings] → grounded LLM`. A field is resolved by the first tier confident enough to clear the gate; the LLM is only ever consulted when everything cheaper has abstained. Determinism is *free, fast, reproducible, and debuggable* — every run's `decisions.jsonl` records exactly which tier bound each field and why, and the deterministic core alone passes **every** test in the suite. The tradeoff: we accept that a purely-LLM approach might map one or two exotic labels the cascade misses, and trade that marginal recall for total reproducibility and a $0 baseline. When the LLM *is* enabled, it costs ~1 batched call per page and never touches formatting or the missing-data gate — so cost can never quietly erode the no-hallucination guarantee.

**2. Abstain over guess — the asymmetric-cost argument.** The single most important design stance: **the agent flags a field for human review rather than inventing a value it isn't sure of.** This is an economic decision before it's a technical one — on an insurance application the two failure modes are not symmetric:

| Failure mode | Consequence |
|---|---|
| **Abstain** on a fillable field | A human spends ~5 seconds finishing one field |
| **Hallucinate** a wrong value | A silently-wrong legal/financial document that may never be caught |

A blank flagged field is a visible, cheap, correctable event. A confidently-wrong value is an invisible, expensive, possibly-uncorrectable one. When the expected cost of a wrong fill dominates the cost of a skipped one, the correct policy is to **abstain under uncertainty** — and to make every abstention loud. `form_b`, `form_hard`, and the live Selenium form all abstained on fields with no backing data (e.g. a `County` field with no matching key) and still **COMPLETED with zero hallucinated fills**.

**3. DOM + accessibility tree over a vision model.** To understand a control, the agent computes its **accessible name** the way a screen reader would: resolving `aria-labelledby`, `aria-label`, `label[for]`, wrapping `<label>`, table `<th>` row/column headers, `<span class="label">` adjacency, and — only as a fallback — geometric proximity. Why not pixels? The DOM already carries the ground truth a browser renders from: it is **exact** (a resolved `for`/`id` pairing is not a probabilistic guess), **cheap & fast** (no image tokens, ~6s/form), and **actionable** (the same handle we perceive with is the handle we fill and then read back to verify). The tradeoff: a vision model would be more robust to canvas-rendered or image-only forms — an acceptable gap, since those cases are rare in real carrier forms and we *detect and flag* them rather than pretend. The adversarial `form_hard` was specifically built to punish DOM-only parsing and the agent handles all of it after the fixes it surfaced.

**4. The grounded LLM as a bounded selector, not a generator.** When the LLM tier runs, it is **not** asked to write a value. It is constrained to pick (1) an **existing** answermap key (or the literal `no_answer`), and (2) an **existing** option from the control. Both choices are then **cross-checked in code** before anything is typed. The model cannot invent a key that isn't in the applicant JSON, cannot invent a `<select>` option, and cannot fabricate a value out of thin air. It is a *classifier over a closed set*, not a text generator — which is why "LLM in the loop" and "zero hallucinated fills" are not in tension here.

**5. The qualifier penalty.** A recurring real-world hazard: near-duplicate fields distinguished only by a qualifier — `current-term premium` vs `prior-term premium`, current vs prior address. Naïve fuzzy matching lets these keys **steal each other's fields**. Two mechanisms stop this: a **greedy assignment** de-conflicts keys competing for the same field, so a shared key can't be spent twice; and a **qualifier penalty** docks the match score when a candidate's qualifier (`current`/`prior`, etc.) contradicts the field's, so "prior-term" can't win a "current-term" slot. The gate itself fills only when `combined = labelConfidence × matchScore` clears a threshold — both *"do I understand this field?"* and *"does this key actually fit?"* must be true at once.

---

## 🛑 What breaks first (honest failure modes)

No agent is universal. These are the cases we know we don't solve — and in every one, the agent **detects and flags** rather than fakes:

| Failure mode | Behavior |
|---|---|
| 🛑 **CAPTCHA / anti-bot** | Detected and flagged. Never faked, never bypassed. |
| 🧩 **Cross-origin iframes** | Detected and flagged — the agent won't reach across an origin boundary and guess. |
| 📅 **Signal-less ambiguous dates** | A date with no format hint (placeholder, pattern, `aria-describedby`) that is genuinely ambiguous (e.g. `03/04/05`) is flagged rather than resolved by coin-flip. |
| 🎨 **Canvas / e-signature fields** | No DOM control to bind to → flagged for a human. |

The through-line: the agent's ceiling is honesty. Where it cannot be sure, it stops and says so — the same principle that governs the whole design.

---

## ❓ FAQ / interview defense

<details>
<summary><strong>How does it avoid hallucinating a value?</strong></summary>

It never generates values. Deterministic tiers only *copy* data that already exists in the answermap; the optional LLM only *selects* an existing key and an existing option, and every selection is re-checked in code. Missing data is left blank and flagged. Across `form_a`, `form_b`, `form_hard`, and a live public form, the tally is **zero hallucinated fills**.
</details>

<details>
<summary><strong>Why not just use a vision model end-to-end?</strong></summary>

The DOM and accessibility tree already encode the exact information a browser renders from — resolving `label[for]` is a fact, not a guess. DOM-first is more exact, far cheaper (~6s/form, no image tokens), and directly actionable: the handle we perceive with is the handle we fill and verify with. Vision's advantage (canvas/image-only forms) covers cases we deliberately detect and flag instead.
</details>

<details>
<summary><strong>The graded run is a hidden form using a widget you've never seen. What happens?</strong></summary>

Nothing about the pipeline is per-form. **PERCEIVE** enumerates whatever controls are visible and derives their accessible names generically; there are no hardcoded selectors, ids, or label strings anywhere. An unfamiliar-but-standard control (custom-labeled `<select>`, a `<th>`-labeled grid cell, a conditional reveal) flows through the same `map → format → act → read-back verify` loop. A truly un-bindable widget (canvas, e-sign) is flagged, not faked. This is exactly what the adversarial `form_hard` and the unseen live Selenium form validated.
</details>

<details>
<summary><strong>How does it know it moved to the next page, if the URL doesn't change?</strong></summary>

It never assumes navigation from the URL. **CLASSIFY TRANSITION** looks for confirmation/error markers and diffs the *step signature* of the page, so it works for single-page-app style transitions where the URL is stable.
</details>

<details>
<summary><strong>How much does it cost, and how slow is it?</strong></summary>

The deterministic core is **$0, ~6s/form, 0 LLM calls** — and it passes the entire suite on its own. With the optional LLM tier enabled it's ~1 batched call per page, roughly **$0.01/form on Haiku**. Formatting and the missing-data gate stay deterministic regardless, so cost never trades against the no-hallucination guarantee. No API key is required to run.
</details>

<details>
<summary><strong>What stops two similar fields — like "current" vs "prior" premium — from grabbing each other's data?</strong></summary>

A greedy assignment de-conflicts keys competing for the same slot, and a qualifier penalty lowers the score when a candidate's qualifier contradicts the field's. Combined with the gate (`labelConfidence × matchScore` over threshold), a "prior-term" key can't win a "current-term" field.
</details>

<details>
<summary><strong>How do I audit what it did?</strong></summary>

Every run writes `runs/<id>/decisions.jsonl` — one record per field with its label, binding method, chosen key, the full candidate list with scores, the final value, the read-back verify result, and a reason. Alongside it: `run_summary.json` (counts, resolution mix, cost), `captured.json` (the confirmation-page data), a Playwright `trace.zip`, and page screenshots. Every decision — including every abstention — is defensible from the artifacts.
</details>

---

## 🏗️ How this was built

This wasn't a one-shot script. The build ran as a pipeline of its own:

1. **Research** — a 26-agent research fleet surveyed the problem space.
2. **Design** — findings were distilled into a full design document (`docs/DESIGN.html`).
3. **Implementation** — the deterministic-first architecture above.
4. **Adversarial review** — a 6-agent code-review panel stress-tested the implementation and caught a **critical cross-page uid-collision bug**.
5. **Adversarial testing** — the purpose-built `form_hard` plus a live public form surfaced and drove fixes for **8 additional real bugs** (parenthetical-acronym stripping, under-weighted `<span>`/`<div>` labels, a too-narrow business-description concept, missing table-`<th>` resolution, ignored detached `aria-describedby` hints, a missing `Municipality`→city synonym, undetected no-add-button repeating grids, and a boolean checkbox binding to a text key).

The result is validated by a **generalization gauntlet** — two provided samples, one adversarial form, and a live form on the public internet — plus **14 passing unit tests** and a clean `tsc --noEmit`.

---

## 👤 About the author

<table>
<tr>
<td>

### Aniruddh Atrey
**AI & Data Science Leader · Entrepreneur · Cybersecurity Expert**

*Building the future with AI, one innovation at a time.*

Technology entrepreneur, AI/ML engineer, and cybersecurity specialist with a **Master's in Computer Science from the University of Florida** and 6+ years building systems that protect, automate, and scale. Co-Founder & COO of **F1Jobs.io** (NeuraScribe Inc, Austin TX), Founder & CTO of **MetaMinds** (enterprise AI automation — RAG pipelines, LLM orchestration, computer vision, NLP), and a Data Science Engineer at **SaveLIFE Foundation**. Formerly secured 50+ government web assets for India's Ministry of Defence at **INNEFU Labs (a DRDO lab)**. **3× IEEE / book-chapter author**, 18+ certifications (Stanford, Google, Cisco, EC-Council, IBM, AWS, ISO), with clients across 10+ countries.

</td>
</tr>
</table>

**Connect**

[![Portfolio](https://img.shields.io/badge/Portfolio-aniruddhatrey.com-00d4ff?logo=astro&logoColor=white)](https://www.aniruddhatrey.com)
[![GitHub](https://img.shields.io/badge/GitHub-AndrousStark-181717?logo=github&logoColor=white)](https://github.com/AndrousStark)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-aniruddhatrey-0A66C2?logo=linkedin&logoColor=white)](https://linkedin.com/in/aniruddhatrey)
[![Email](https://img.shields.io/badge/Email-atreyaniruddh@gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:atreyaniruddh@gmail.com)

---

<div align="center">

**FormWright** — built by **Aniruddh Atrey**

*Deterministic-first. Grounded. It would rather flag a field than fake one.*

Built for the **Elasa.ai** ML-engineer (Carrier Automation) take-home · Licensed MIT

</div>