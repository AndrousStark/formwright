// Navigation & completion detection. Never assumes the URL changes: transitions are
// classified by confirmation markers, visible validation errors, and a step-signature
// diff — so it works for real-nav, SPA, and single-page div-toggle wizards alike.

import type { Page, Locator } from 'playwright';
import { thresholds } from '../config.js';

const TO = { timeout: thresholds.actionTimeoutMs };
export type Transition = 'ADVANCED' | 'STUCK' | 'COMPLETED' | 'TIMEOUT' | 'NO_BUTTON';

const ADVANCE_RE = /\b(next|continue|save|submit|finish|proceed|review|get|request|quote)\b/i;
const SKIP_RE = /\b(add|another|remove|delete|back|previous|cancel|clear|reset)\b|^[+×x✕]$/i;
const ADD_RE = /\b(add|another|more|new)\b|^\s*\+/i;

async function candidateButtons(page: Page): Promise<Locator[]> {
  const loc = page.locator('button, input[type="submit"], input[type="button"], a[role="button"]');
  const n = await loc.count();
  const out: Locator[] = [];
  for (let i = 0; i < n; i++) {
    const b = loc.nth(i);
    if (await b.isVisible().catch(() => false)) out.push(b);
  }
  return out;
}

async function textOf(b: Locator): Promise<string> {
  const t = (await b.textContent().catch(() => '')) || '';
  const v = (await b.getAttribute('value').catch(() => '')) || '';
  return (t + ' ' + v).replace(/\s+/g, ' ').trim();
}

export async function findAdvanceButton(page: Page): Promise<Locator | null> {
  const buttons = await candidateButtons(page);
  let fallback: Locator | null = null;
  for (const b of buttons) {
    const txt = await textOf(b);
    if (SKIP_RE.test(txt)) continue;
    if (ADVANCE_RE.test(txt)) return b;
    if (!fallback) fallback = b;
  }
  return fallback;
}

export async function findAddButton(page: Page): Promise<Locator | null> {
  for (const b of await candidateButtons(page)) {
    const txt = await textOf(b);
    if (/\b(remove|delete)\b|^[×x✕]$/i.test(txt)) continue;
    if (ADD_RE.test(txt)) return b;
  }
  return null;
}

export async function stepSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const vis = Array.from(document.querySelectorAll('input,select,textarea')).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const ids = vis.map((el) => (el as HTMLInputElement).id || (el as HTMLInputElement).name || el.tagName).join('|');
    return location.href + '::' + vis.length + '::' + ids;
  });
}

export async function hasVisibleErrors(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Specific validation selectors only (no `[class*=error]` catch-all, which would treat a
    // benign always-visible "error-hint" element as a validation failure and wedge the run).
    const sel = '[aria-invalid="true"], [role="alert"], .error, .err, .invalid, .field-error, .has-error, .Mui-error';
    const VALIDATION = /required|please|invalid|must |cannot|missing|complete|enter |select /i;
    return Array.from(document.querySelectorAll(sel)).some((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el as HTMLElement);
      if (r.width <= 0 || r.height <= 0 || cs.display === 'none' || cs.visibility === 'hidden') return false;
      const txt = (el.textContent || '').trim();
      // aria-invalid inputs count on their own; text-bearing error nodes must read like a
      // validation message so a static themed element with "error" in its class doesn't fire.
      if (el.getAttribute('aria-invalid') === 'true') return true;
      return txt.length > 0 && VALIDATION.test(txt);
    });
  });
}

export async function captureConfirmation(page: Page): Promise<{ isConfirmation: boolean; data: unknown | null }> {
  return page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    const marker = /submission (received|complete)|thank you|confirmation|reference (number|#|no)|submission id|captured data|quote (number|id)|successfully (submitted|received)/i.test(bodyText);
    let data: unknown = null;
    for (const pre of Array.from(document.querySelectorAll('pre'))) {
      const r = pre.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      const t = (pre.textContent || '').trim();
      if (t.startsWith('{') || t.startsWith('[')) { try { data = JSON.parse(t); break; } catch { /* not json */ } }
    }
    return { isConfirmation: marker || data !== null, data };
  });
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(thresholds.settleMs);
}

/** Click the advance button and classify what happened. */
export async function advance(page: Page): Promise<{ transition: Transition; buttonText: string }> {
  const btn = await findAdvanceButton(page);
  if (!btn) return { transition: 'NO_BUTTON', buttonText: '' };
  const buttonText = await textOf(btn);
  const before = await stepSignature(page);
  await btn.click(TO);
  await settle(page);

  const conf = await captureConfirmation(page);
  if (conf.isConfirmation) return { transition: 'COMPLETED', buttonText };
  if (await hasVisibleErrors(page)) return { transition: 'STUCK', buttonText };
  const after = await stepSignature(page);
  if (after !== before) return { transition: 'ADVANCED', buttonText };
  return { transition: 'TIMEOUT', buttonText };
}
