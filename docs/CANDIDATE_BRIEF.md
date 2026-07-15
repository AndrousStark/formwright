# Take-Home Task: AI Form Automation Agent

**Role:** ML Engineer — Carrier Automation
**Suggested time:** 6–8 hours. We are evaluating your approach and judgment, not polish. Please do not spend more than a weekend on this.
**Deadline:** 3 days from the date you receive this task.

---

## Background

We automate insurance quote submissions on carrier web portals. Today, every carrier has a hand-written browser automation script. We want to move toward a system that can handle a **brand-new carrier portal it has never seen before** — mapping our internal applicant data onto an unfamiliar web form and filling it out automatically, with no pre-written, carrier-specific script.

This task is a small, self-contained version of that exact problem.

## Your task

Build an **AI-powered form automation agent** that:

1. Takes an `answermap.json` file (provided) — this represents the applicant data we have in our database.
2. Takes a **URL or local path to a multi-page HTML form** it has never seen before.
3. Automatically navigates the form, semantically maps form fields to answermap entries, fills them in, and submits.

We have provided **two sample forms** (`forms/form_a.html`, `forms/form_b.html`). Your agent should work on both **without any form-specific hardcoding** — no hardcoded selectors, field names, or label strings from these specific forms in your logic.

**Important:** After you submit, we will run your agent unmodified on a **third form you have not seen**. That run is the primary evaluation. Any solution that pattern-matches on the two sample forms specifically will fail this step, so build for generalization.

## Rules & constraints

- Use any browser automation framework (Playwright preferred, since that's our stack; Puppeteer/Selenium acceptable).
- Use any LLM you like (OpenAI, Anthropic, Gemini, or a local model).
- You may use AI coding assistants to write your code — we assume you will. The follow-up interview will test whether you deeply understand your own design, so make sure you do.
- Language: Node.js/TypeScript
- Each sample form ends on a confirmation page that prints a JSON summary of the values it captured. Use it to check yourself — we will use it to score you.

## Things your agent must handle

These situations exist in the sample forms and will exist in the hidden form:

- **Semantic field mapping** — form labels will not match answermap keys. The form may say "Employer Identification Number" while the answermap key is `FEIN`.
- **Multiple input types** — text inputs, dropdowns, radio buttons, checkboxes, date fields.
- **Dropdown/radio option matching** — the answermap value may not exactly match any option string (e.g. answermap says `LLC`, the dropdown says "Limited Liability Company"). Pick the right option.
- **Value formatting** — the form may want a value in a different format than the answermap stores it (dates, phone numbers, "no dashes" instructions, etc.).
- **Repeating sections** — e.g. an "Add classification" button that adds rows; the answermap has an array.
- **Conditional fields** — fields that appear only after another field is answered.
- **Missing answers** — the form may ask something the answermap doesn't contain. Your agent must NOT hallucinate an answer. Decide a policy (skip, safe default, or flag for human review) and document it. Fields flagged for review should be reported in your agent's output.
- **Multi-page navigation** — Next/Continue buttons, and detecting when the form is complete vs. stuck.

## Deliverables

Submit a Git repository (or zip) containing:

1. **Working code** with a README: exact commands to install and run, e.g. `python agent.py --form forms/form_a.html --answers answermap.json`.
2. **Design doc (max 1 page)** covering:
   - How you perceive the page (raw DOM? accessibility tree? screenshots + vision model? hybrid?) and why.
   - How field→answer mapping works (single LLM call per page? per field? embeddings? heuristics first, LLM fallback?).
   - Your policy for missing/ambiguous answers.
   - Cost & latency: roughly how many LLM calls and tokens per form, and one idea for reducing them at scale.
   - What breaks first: the top 2 real-world situations where your agent would fail (e.g. CAPTCHAs, iframes, canvas-rendered forms) and how you'd approach them.
3. **Run artifacts** for both sample forms: the agent's log/trace showing its reasoning or decisions, and the final confirmation-page JSON from each run.

## How we evaluate

| Criteria | Weight |
|---|---|
| Accuracy on the hidden form (fields correctly filled, submission completed) | 40% |
| Handling of edge cases (missing answers, option matching, repeating rows, conditionals) | 20% |
| Code quality & architecture (could this live in a production codebase?) | 15% |
| Design doc: clarity of reasoning, cost-awareness, honest failure analysis | 15% |
| Observability (logs/traces that would let an engineer debug a failed run) | 10% |

A 45-minute walkthrough call follows submission, where you'll explain your design and we'll discuss extensions live.

## What we are NOT looking for

- A perfect UI or dashboard.
- Handling of logins, CAPTCHAs, or anti-bot measures (discuss in the design doc if you like, don't build).
- 100% accuracy. A well-reasoned 85% with clean failure reporting beats a brittle 95%.

Questions? Email us — asking good clarifying questions is a positive signal, not a negative one.
