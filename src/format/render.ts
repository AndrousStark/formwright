// Deterministic value formatting keyed off the TARGET control's contract
// (type / pattern / placeholder / maxlength / nearby note). The LLM never formats.

import { parseISO, isValid, format as fmtDate } from 'date-fns';
import type { FieldDescriptor } from '../types.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EIN = /^\d{2}-?\d{7}$/;
const PHONEISH = /[\d().\-\s]{7,}/;

export function renderValue(field: FieldDescriptor, raw: string): string {
  const v = raw.trim();
  const hint = `${field.label.name} ${field.placeholder ?? ''} ${field.pattern ?? ''}`.toLowerCase();

  if (ISO_DATE.test(v)) return renderDate(field, v, hint);
  // Only treat a 9-digit value as an EIN when the FIELD says so — never reformat a plain
  // 9-digit number (e.g. a payroll) into "12-3456780".
  if (EIN.test(v) && /fein|ein|tax id|employer identification|federal id/.test(hint)) return renderEin(field, v, hint);
  if (isPhone(field, v)) return renderPhone(field, v, hint);
  if (field.kind === 'number' || field.inputType === 'number') return v.replace(/[$,\s]/g, '');
  return v;
}

function renderDate(field: FieldDescriptor, iso: string, hint: string): string {
  const d = parseISO(iso);
  if (!isValid(d)) return iso;
  if (field.inputType === 'date' || field.kind === 'date') return fmtDate(d, 'yyyy-MM-dd'); // native input
  if (/dd\W*mm\W*yyyy/.test(hint)) return fmtDate(d, 'dd/MM/yyyy');
  if (/mm\W*dd\W*yyyy/.test(hint)) return fmtDate(d, 'MM/dd/yyyy');
  if (/yyyy\W*mm\W*dd/.test(hint)) return fmtDate(d, 'yyyy-MM-dd');
  // No on-field signal: keep ISO rather than guess a locale ordering (avoids a valid-but-wrong date).
  return iso;
}

function isPhone(field: FieldDescriptor, v: string): boolean {
  if (field.inputType === 'tel') return true;
  const digits = v.replace(/\D/g, '');
  return /phone|telephone|tel|mobile|cell/.test(field.label.name.toLowerCase()) && digits.length >= 7 && PHONEISH.test(v);
}

function renderPhone(field: FieldDescriptor, v: string, hint: string): string {
  const digits = v.replace(/\D/g, '');
  if (/digits only|no dashes|numbers only|\bdigits\b/.test(hint) || field.pattern === '\\d*' || /^\\d+$/.test(field.pattern ?? '')) {
    return digits;
  }
  return v; // keep the applicant's canonical formatting
}

function renderEin(field: FieldDescriptor, v: string, hint: string): string {
  const digits = v.replace(/\D/g, '');
  const noDash = /no dash|digits only|\bxxxxxxxxx\b|^\\d\{9\}$/.test(hint) || (field.maxLength === 9);
  if (noDash) return digits;
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : v;
}
