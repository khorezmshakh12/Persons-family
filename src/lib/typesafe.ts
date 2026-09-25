import 'server-only';
import { sql } from '@/lib/db/client';

// Minimal TypeSafe (System One / Jev) client — https://docs.typesafe.ai/api
// Server-only: the key lives in TYPESAFE_API_KEY (Cloud Run secret) and never
// reaches the browser. Every call is best-effort: no key, a timeout, or an
// API error returns null and the caller simply skips the AI enrichment.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';
const TIMEOUT_MS = 10_000;

type Structured = string | Record<string, unknown> | unknown[];

export type TsQuestion =
  | { type: 'noul'; instructions: Structured; criteria?: { true?: Structured; false?: Structured } }
  | { type: 'choice'; instructions: Structured; criteria: Record<string, Structured | null> }
  | { type: 'score'; instructions: Structured; criteria: Structured[] };

export type TsAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; score: number; probabilities: Record<string, number>; legend: Record<string, string>; confidence: number };

export type TsResult = {
  model: string;
  answers: Record<string, TsAnswer>;
  usage?: { input_tokens: number; output_tokens: number };
};

/** Jev bills input tokens only: $0.042 per million (docs.typesafe.ai/models). */
export const JEV_USD_PER_MTOK = 0.042;

export const typesafeEnabled = () => !!process.env.TYPESAFE_API_KEY;

/** One request, all questions evaluated in parallel over the same state.
 * Retries once on 429/529 (rate limit / overloaded). */
export async function askTypeSafe(
  state: unknown,
  questions: Record<string, TsQuestion>,
  feature = 'other',
): Promise<TsResult | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, model: MODEL, questions }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
      if ((res.status === 429 || res.status === 529) && attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (!res.ok) {
        console.error('typesafe request failed', res.status, (await res.text()).slice(0, 300));
        return null;
      }
      const out = (await res.json()) as TsResult;
      // Usage ledger for the cost report — never fails the call.
      if (out.usage) {
        await sql`
          insert into ai_usage (feature, model, input_tokens, output_tokens)
          values (${feature}, ${out.model ?? MODEL}, ${out.usage.input_tokens ?? 0}, ${out.usage.output_tokens ?? 0})`.catch(() => {});
      }
      return out;
    } catch (error) {
      console.error('typesafe request error', error instanceof Error ? error.message : error);
      return null;
    }
  }
  return null;
}
