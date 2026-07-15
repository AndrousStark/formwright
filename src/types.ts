// Shared contracts for the whole agent. Every module depends on these types only,
// so the pieces stay decoupled and swappable.

export type WidgetKind =
  | 'text' | 'textarea' | 'number' | 'email' | 'tel' | 'url'
  | 'date' | 'select' | 'radio' | 'checkbox' | 'combobox' | 'unfillable';

export interface OptionDesc {
  value: string;
  text: string;
  /** Stamped handle for radio/checkbox members (selects use native value). */
  uid?: string;
}

export interface LabelInfo {
  name: string;
  source: string;          // how the name was derived (labelledby | for | prevLabel | proximity | placeholder | nameId ...)
  confidence: number;      // 0..1 — how much we trust that this label belongs to this control
  group?: string;          // nearest fieldset legend / section heading
  candidates: { source: string; text: string; confidence: number }[]; // all label evidence, for the audit trail
}

export interface FieldDescriptor {
  uid: string;             // code-owned stable handle (a data-agent-uid stamped on the element)
  selector: string;        // resilient selector the code owns: [data-agent-uid="..."]
  kind: WidgetKind;
  label: LabelInfo;
  name?: string;
  id?: string;
  inputType?: string;      // raw <input type>
  placeholder?: string;
  pattern?: string;
  maxLength?: number;
  required: boolean;
  disabled?: boolean;
  options?: OptionDesc[];  // for select / radio group / checkbox group
  radioGroup?: string;     // name attr of a radio group
  currentValue?: string;   // prefilled value, if any
  domOrder: number;        // position in the visible DOM (for repeating-row chunking)
}

export type Action = 'filled' | 'skipped' | 'flagged';

export type ResolveSource =
  | 'exact' | 'contains' | 'alias' | 'acronym' | 'fuzzy' | 'embedding'
  | 'llm' | 'composed' | 'boolean' | 'numeric' | 'assumed' | 'none';

export interface CandidateKey { key: string; score: number; }

export interface Resolution {
  uid: string;
  label: string;
  labelSource: string;
  answermapKey: string | null;
  rawValue?: unknown;
  formattedValue?: string;
  chosenOption?: OptionDesc;
  optionStrategy?: string;
  source: ResolveSource;
  matchScore: number;      // semantic label->key score, 0..1
  labelConfidence: number;
  combined: number;        // labelConfidence * matchScore — the gate variable
  action: Action;
  status: string;          // filled | filled_low_confidence | skipped_missing | skipped_low_confidence | flagged_* | verify_failed | assumed
  candidateKeys: CandidateKey[];
  reason: string;
  verified?: boolean;
}

export interface AnswerScalar { key: string; value: string; }

export interface FlatAnswers {
  raw: Record<string, any>;
  /** Scalar leaves available for field mapping. */
  scalars: AnswerScalar[];
  /** Array-valued answers keyed by their answermap key (e.g. ClassCodes). */
  arrays: Record<string, any[]>;
  has(key: string): boolean;
  value(key: string): string | undefined;
}

export interface RunConfig {
  formPath: string;
  answersPath: string;
  outDir: string;
  headed: boolean;
  useLlm: boolean;
  useEmbeddings: boolean;
  assumeCertify: boolean;
}
