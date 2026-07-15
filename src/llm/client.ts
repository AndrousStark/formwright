// Provider-agnostic LLM client over fetch (no SDK dependency). Returns null when no key
// is configured, so the whole LLM tier is cleanly optional.

import { models } from '../config.js';

export interface LlmClient {
  name: string;
  complete(system: string, user: string): Promise<string>;
}

export function getLlmClient(): LlmClient | null {
  const provider = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();
  if (provider === 'openai' && process.env.OPENAI_API_KEY) return openai();
  if (provider !== 'openai' && process.env.ANTHROPIC_API_KEY) return anthropic();
  if (process.env.ANTHROPIC_API_KEY) return anthropic();
  if (process.env.OPENAI_API_KEY) return openai();
  return null;
}

function anthropic(): LlmClient {
  return {
    name: `anthropic:${models.anthropic}`,
    async complete(system, user) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: models.anthropic, max_tokens: 1500, temperature: models.temperature,
          system, messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`);
      const data: any = await res.json();
      return (data.content || []).map((c: any) => c.text || '').join('');
    },
  };
}

function openai(): LlmClient {
  return {
    name: `openai:${models.openai}`,
    async complete(system, user) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: models.openai, temperature: models.temperature,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`openai ${res.status}: ${await res.text()}`);
      const data: any = await res.json();
      return data.choices?.[0]?.message?.content ?? '';
    },
  };
}
