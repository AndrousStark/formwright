// Loads and flattens the answermap. The provided shape is { Key: { answer: value } }
// where value is a string OR (for repeating sections) an array of row objects.

import fs from 'node:fs';
import type { FlatAnswers } from './types.js';

export function loadAnswers(pathToJson: string): FlatAnswers {
  const raw = JSON.parse(fs.readFileSync(pathToJson, 'utf8')) as Record<string, any>;

  const scalars: { key: string; value: string }[] = [];
  const arrays: Record<string, any[]> = {};
  const flat: Record<string, any> = {};

  for (const [key, entry] of Object.entries(raw)) {
    // Support both { answer: ... } and a bare value, so we tolerate other answermap shapes.
    const val = entry && typeof entry === 'object' && 'answer' in entry ? entry.answer : entry;
    flat[key] = val;
    if (Array.isArray(val)) {
      arrays[key] = val;
    } else if (val !== null && val !== undefined && String(val).trim() !== '') {
      scalars.push({ key, value: String(val) });
    }
  }

  return makeFlat(flat, scalars, arrays);
}

/** Build a FlatAnswers view from a plain object (used for repeating-section row items). */
export function flatFromObject(obj: Record<string, any>): FlatAnswers {
  const scalars: { key: string; value: string }[] = [];
  const flat: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    flat[key] = val;
    if (val !== null && val !== undefined && !Array.isArray(val) && String(val).trim() !== '') {
      scalars.push({ key, value: String(val) });
    }
  }
  return makeFlat(flat, scalars, {});
}

function makeFlat(flat: Record<string, any>, scalars: { key: string; value: string }[], arrays: Record<string, any[]>): FlatAnswers {
  return {
    raw: flat,
    scalars,
    arrays,
    has(key: string) { return key in flat && flat[key] !== null && flat[key] !== undefined && String(flat[key]).trim() !== ''; },
    value(key: string) { const v = flat[key]; return v === undefined || v === null ? undefined : String(v); },
  };
}
