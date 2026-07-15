#!/usr/bin/env node
// CLI entry. Deterministic core needs no API key; providing ANTHROPIC_API_KEY (or
// OPENAI_API_KEY) enables the LLM fallback tier for genuinely ambiguous fields.

import { runForm } from './orchestrator.js';
import type { RunConfig } from './types.js';

function parseArgs(argv: string[]): RunConfig {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { args.set(key, next); i++; }
      else flags.add(key);
    }
  }
  const form = args.get('form');
  const answers = args.get('answers');
  if (!form || !answers) {
    console.error('Usage: tsx src/index.ts --form <path|url> --answers <answermap.json> [--out runs/] [--headed] [--no-llm] [--no-certify]');
    process.exit(2);
  }
  const hasKey = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
  return {
    formPath: form,
    answersPath: answers,
    outDir: args.get('out') || 'runs',
    headed: flags.has('headed'),
    useLlm: hasKey && !flags.has('no-llm'),
    useEmbeddings: process.env.ENABLE_EMBEDDINGS === '1' && !flags.has('no-embeddings'),
    assumeCertify: !flags.has('no-certify'),
  };
}

const cfg = parseArgs(process.argv.slice(2));
runForm(cfg)
  .then((s) => process.exit(s.outcome === 'completed' ? 0 : 1))
  .catch((e) => { console.error('FATAL:', e); process.exit(1); });
