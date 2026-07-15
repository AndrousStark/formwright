// Domain concept table for US workers'-comp / ACORD-130 forms. This is legitimate
// DOMAIN knowledge (it generalizes across carriers), NOT per-sample-form hardcoding —
// no selectors, ids, or literal label strings from form_a/form_b appear here.
//
// A form label and an answermap key match on a concept when both contain a phrase
// from the same group (compared on NORMALIZED text so article-stripping lines up).

import { normalize } from './normalize.js';

const RAW_CONCEPTS: string[][] = [
  ['fein', 'ein', 'employer identification number', 'employer id number', 'employer id', 'federal employer id', 'federal tax id', 'federal id', 'tax id', 'tax identification number'],
  ['entity type', 'legal entity', 'organization type', 'org type', 'business structure', 'type of entity', 'form of business', 'ownership type'],
  ['business legal name', 'legal business name', 'business name', 'name of insured', 'insured name', 'named insured', 'applicant name', 'legal name', 'company name', 'firm name'],
  ['dba', 'doing business as', 'trade name', 'fictitious name'],
  ['business description', 'description of operations', 'nature of business', 'nature of operations', 'business operations', 'describe operations', 'nature of work', 'work performed', 'scope of operations', 'operations performed', 'describe the work', 'describe the nature', 'operations'],
  ['website', 'web site', 'web address', 'url'],
  ['years in business', 'years operating', 'time in business', 'years established'],
  ['first name', 'given name', 'forename'],
  ['last name', 'surname', 'family name'],
  ['contact person', 'contact name', 'full name', 'name of contact', 'primary contact', 'person for this submission'],
  ['title', 'job title', 'position', 'contact title'],
  ['email', 'e mail', 'email address'],
  ['phone', 'telephone', 'phone number', 'contact phone', 'mobile', 'cell'],
  ['street', 'address line', 'street address', 'mailing address'],
  ['city', 'town', 'municipality', 'locality', 'borough'],
  ['state', 'province'],
  ['zip', 'zip code', 'postal code', 'postcode'],
  ['county'],
  ['effective date', 'inception date', 'policy effective', 'proposed inception', 'requested effective', 'start date', 'coverage start'],
  ['expiration date', 'expiry date', 'proposed expiration', 'policy expiration', 'end date', 'coverage end'],
  ['full time employees', 'ft employees'],
  ['part time employees', 'pt employees'],
  ['annual payroll', 'total payroll', 'payroll', 'remuneration', 'estimated annual payroll', 'annual remuneration'],
  ['class code', 'ncci code', 'classification code'],
  ['classification description', 'class description', 'description'],
  ['prior coverage', 'current coverage', 'currently carry', 'coverage in force', 'wc coverage', 'workers compensation coverage', 'had coverage', 'insurance in force'],
  ['carrier', 'current carrier', 'expiring carrier', 'carrier name', 'insurance carrier', 'insurer'],
  ['premium', 'annual premium', 'current premium'],
  ['claims', 'claim count', 'number of claims', 'claims reported', 'losses', 'loss count'],
  ['subcontractors', 'subcontractor', 'use subcontractors'],
  ['experience mod', 'ex mod', 'x mod', 'emr', 'mod factor', 'experience modification'],
  ['number of employees', 'employee count', 'employees', 'emp', 'headcount'],
];

const NORM_CONCEPTS: string[][] = RAW_CONCEPTS.map((g) => g.map((p) => normalize(p)).filter(Boolean));

// Qualifier markers disambiguate "current/expiring" vs "prior/previous" terms — a
// common WC pattern where loss history repeats by policy year.
export const CURRENT_MARKERS = ['current', 'expiring', 'existing', 'present'];
export const PRIOR_MARKERS = ['prior', 'previous', 'past', 'former', 'prior1', 'prior2'];
export const SPECIFIC_MARKERS = ['term', 'current', 'prior', 'expiring', 'previous', 'renewal', 'prior1', 'prior2'];

/** Do a normalized label and a normalized key phrase share a concept group? */
export function sharedConcept(labelNorm: string, keyNorm: string): boolean {
  const l = ` ${labelNorm} `;
  const k = ` ${keyNorm} `;
  for (const group of NORM_CONCEPTS) {
    if (group.some((p) => l.includes(` ${p} `)) && group.some((p) => k.includes(` ${p} `))) return true;
  }
  return false;
}

export function hasAny(text: string, markers: string[]): boolean {
  const t = ` ${text} `;
  return markers.some((m) => t.includes(` ${m} `));
}
