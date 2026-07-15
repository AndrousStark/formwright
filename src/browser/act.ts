// Dispatch a resolution onto the DOM via the code-owned locator, then read the value
// back and confirm it landed. One bounded retry (fill -> pressSequentially) for masked /
// controlled inputs, then give up and let the caller flag it.

import type { Page } from 'playwright';
import type { FieldDescriptor, Resolution } from '../types.js';
import { thresholds } from '../config.js';

const TO = { timeout: thresholds.actionTimeoutMs };
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const affirmative = (v: string) => /^(y|yes|true|1|t|checked|on)$/i.test((v || '').trim());

export interface ActResult { verified: boolean; error?: string; }

export async function actField(page: Page, field: FieldDescriptor, res: Resolution): Promise<ActResult> {
  try {
    if (field.kind === 'select') return await fillSelect(page, field, res);
    if (field.kind === 'radio') return await fillRadio(page, res);
    if (field.kind === 'checkbox') return await fillCheckbox(page, field, res);
    return await fillText(page, field, res);
  } catch (e: any) {
    return { verified: false, error: String(e?.message || e).split('\n')[0] };
  }
}

async function fillSelect(page: Page, field: FieldDescriptor, res: Resolution): Promise<ActResult> {
  if (!res.chosenOption) return { verified: false, error: 'no option' };
  const loc = page.locator(field.selector);
  await loc.selectOption({ value: res.chosenOption.value }, TO);
  const got = await loc.inputValue(TO);
  return { verified: norm(got) === norm(res.chosenOption.value) };
}

async function fillRadio(page: Page, res: Resolution): Promise<ActResult> {
  if (!res.chosenOption?.uid) return { verified: false, error: 'no radio uid' };
  const loc = page.locator(`[data-agent-uid="${res.chosenOption.uid}"]`);
  await loc.check(TO);
  return { verified: await loc.isChecked() };
}

async function fillCheckbox(page: Page, field: FieldDescriptor, res: Resolution): Promise<ActResult> {
  const loc = page.locator(field.selector);
  const want = affirmative(res.formattedValue ?? 'yes');
  await loc.setChecked(want, TO);
  return { verified: (await loc.isChecked()) === want };
}

async function fillText(page: Page, field: FieldDescriptor, res: Resolution): Promise<ActResult> {
  const loc = page.locator(field.selector);
  const val = res.formattedValue ?? '';
  await loc.fill(val, TO);
  let got = await loc.inputValue(TO);
  if (norm(got) !== norm(val)) {
    // controlled/masked input reverted — retype key by key
    await loc.fill('', TO);
    await loc.pressSequentially(val, { ...TO, delay: 12 });
    got = await loc.inputValue(TO);
  }
  return { verified: norm(got) === norm(val) };
}
