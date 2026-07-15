import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FieldDescriptor } from '../src/types.js';
import { renderValue } from '../src/format/render.js';
import { resolveOption } from '../src/match/options.js';
import { scoreLabelToKey } from '../src/match/score.js';
import { normalize, humanizeKey } from '../src/match/normalize.js';

function field(p: Partial<FieldDescriptor> & { label?: any }): FieldDescriptor {
  return {
    uid: 'f1', selector: '', kind: 'text', required: false, domOrder: 0,
    label: { name: '', source: 'test', confidence: 0.9, candidates: [] },
    ...p,
  } as FieldDescriptor;
}

test('renderValue: native date stays ISO', () => {
  const f = field({ kind: 'date', inputType: 'date', label: { name: 'Effective Date', source: 't', confidence: 0.9, candidates: [] } });
  assert.equal(renderValue(f, '2026-08-01'), '2026-08-01');
});

test('renderValue: text date reformats to placeholder mask', () => {
  const f = field({ kind: 'text', placeholder: 'MM/DD/YYYY', label: { name: 'Proposed Inception Date', source: 't', confidence: 0.9, candidates: [] } });
  assert.equal(renderValue(f, '2026-08-01'), '08/01/2026');
});

test('renderValue: phone digits-only when instructed', () => {
  const f = field({ kind: 'text', label: { name: 'Contact Telephone digits only', source: 't', confidence: 0.9, candidates: [] } });
  assert.equal(renderValue(f, '(619) 555-0142'), '6195550142');
});

test('renderValue: phone preserved when no digits-only signal', () => {
  const f = field({ kind: 'tel', inputType: 'tel', label: { name: 'Phone Number', source: 't', confidence: 0.9, candidates: [] } });
  assert.equal(renderValue(f, '(619) 555-0142'), '(619) 555-0142');
});

test('renderValue: EIN keeps dashes / strips when maxlength 9 (only when field says EIN)', () => {
  const einLabel = (extra: any) => field({ label: { name: 'Federal Tax ID', source: 't', confidence: 0.9, candidates: [] }, ...extra });
  assert.equal(renderValue(einLabel({ placeholder: 'XX-XXXXXXX' }), '84-2917465'), '84-2917465');
  assert.equal(renderValue(einLabel({ maxLength: 9 }), '84-2917465'), '842917465');
  // a plain 9-digit number in a non-EIN field must NOT be reformatted as an EIN
  assert.equal(renderValue(field({ kind: 'number', label: { name: 'Annual Payroll', source: 't', confidence: 0.9, candidates: [] } }), '123456789'), '123456789');
});

test('resolveOption: acronym LLC -> Limited Liability Company', () => {
  const m = resolveOption('LLC', [{ value: 'Limited Liability Company', text: 'Limited Liability Company' }, { value: 'S Corporation', text: 'S Corporation' }]);
  assert.equal(m?.option.value, 'Limited Liability Company');
  assert.equal(m?.strategy, 'acronym');
});

test('resolveOption: exact value code', () => {
  const m = resolveOption('LLC', [{ value: 'LLC', text: 'LLC' }, { value: 'CORP', text: 'Corporation' }]);
  assert.equal(m?.option.value, 'LLC');
});

test('resolveOption: boolean No -> value N', () => {
  const m = resolveOption('No', [{ value: 'Y', text: 'Yes' }, { value: 'N', text: 'No' }]);
  assert.equal(m?.option.value, 'N');
});

test('resolveOption: numeric 1 -> "1 claim"; 0 -> None', () => {
  const opts = [{ value: '0', text: 'None' }, { value: '1', text: '1 claim' }, { value: '2', text: '2 claims' }];
  assert.equal(resolveOption('1', opts)?.option.value, '1');
  assert.equal(resolveOption('0', opts)?.option.value, '0');
});

test('resolveOption: abstains on genuine mismatch', () => {
  assert.equal(resolveOption('Sole Proprietorship', [{ value: 'X', text: 'Partnership' }]), null);
});

test('scoreLabelToKey: FEIN semantic alias', () => {
  assert.ok(scoreLabelToKey(normalize('Employer Identification Number (EIN)'), 'FEIN').score >= 0.85);
});

test('scoreLabelToKey: policy-level beats current-term for an unqualified date label', () => {
  const l = normalize('Requested Effective Date');
  const policy = scoreLabelToKey(l, 'PolicyEffectiveDate').score;
  const current = scoreLabelToKey(l, 'CurrentTermEffectiveDate').score;
  assert.ok(policy > current, `policy ${policy} should beat current ${current}`);
});

test('scoreLabelToKey: prior-term key does not steal a current label', () => {
  const l = normalize('Current Carrier Name');
  assert.ok(scoreLabelToKey(l, 'CurrentTermCarrier').score > scoreLabelToKey(l, 'Prior1TermCarrier').score);
});

test('humanizeKey splits camelCase', () => {
  assert.equal(humanizeKey('BusinessLegalName'), 'business legal name');
  assert.equal(humanizeKey('FEIN'), 'fein');
});
