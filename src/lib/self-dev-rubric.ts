/** Self-development rubric — shared by server and client. Advisory to the
 * CEO's free score (which stays unbounded by owner decision). */
export const RUBRIC_KEYS = ['depth', 'applied', 'evidence'] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];
export type Rubric = Record<RubricKey, number>;

export const RUBRIC_LABEL: Record<RubricKey, string> = {
  depth: 'O‘rganish chuqurligi',
  applied: 'Amalda qo‘llash',
  evidence: 'Isbot',
};

export const RUBRIC_HINT: Record<RubricKey, string> = {
  depth: 'Shunchaki nomi emas — nimani, qanchalik chuqur o‘rgangan',
  applied: 'Ishda qayerda, qanday natija bilan qo‘llagan',
  evidence: 'Faktlar, raqamlar, havola yoki sertifikat',
};

export const SELF_DEV_KINDS = ['course', 'book', 'skill', 'practice', 'other'] as const;
export type SelfDevKind = (typeof SELF_DEV_KINDS)[number];

export function parseRubric(v: unknown): Partial<Rubric> | null {
  if (!v || typeof v !== 'object') return null;
  const out: Partial<Rubric> = {};
  for (const k of RUBRIC_KEYS) {
    const n = Number((v as Record<string, unknown>)[k]);
    if (Number.isInteger(n) && n >= 1 && n <= 5) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

/** Consecutive months with a report, counting back from the latest month
 * given (YYYY-MM-01 strings, any order). */
export function streak(months: string[], current: string): number {
  const set = new Set(months);
  let n = 0;
  let [y, m] = current.split('-').map(Number);
  // A month still open without a report doesn't break the streak yet.
  if (!set.has(current)) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  for (;;) {
    const key = `${y}-${String(m).padStart(2, '0')}-01`;
    if (!set.has(key)) return n;
    n += 1;
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
}
