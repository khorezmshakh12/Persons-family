import type { KpiItem, Scenario } from '@/lib/kpi-plan';

/**
 * Where a month is heading, from the actual results typed so far against
 * each numeric item's three targets. Pure — used live while the employee
 * fills the self-assessment, and by the CEO's grade view.
 *
 * Per item: below the "good" target scores 0–1 (pro rata from bad to good),
 * between good and great 1–2, at/above great 2. Items whose targets fall
 * (bad > great, e.g. cost per lead) are read the other way round. Text,
 * project lists and unparsable values are skipped.
 */
export type Forecast = {
  /** 0 (bad) … 2 (great), averaged over scored items. */
  score: number;
  scenario: Scenario;
  /** How many items had a usable actual + targets. */
  scored: number;
};

const num = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.+-]/g, ''));
  return String(v).trim() === '' || !Number.isFinite(n) ? null : n;
};

export function itemScore(item: Pick<KpiItem, 'kind' | 'target_bad' | 'target_good' | 'target_great' | 'actual'>): number | null {
  if (item.kind === 'text' || item.kind === 'projects') return null;
  const actual = num(item.actual);
  let bad = num(item.target_bad);
  let good = num(item.target_good);
  let great = num(item.target_great);
  if (actual === null || good === null || great === null) return null;
  bad ??= good;
  let a = actual;
  // Lower-is-better: mirror everything so the maths below reads one way.
  if (great < bad) {
    a = -a;
    bad = -bad;
    good = -good;
    great = -great;
  }
  if (a >= great) return 2;
  if (a >= good) return great === good ? 2 : 1 + (a - good) / (great - good);
  if (good === bad) return a >= bad ? 1 : 0;
  return Math.max(0, Math.min(1, (a - bad) / (good - bad)));
}

export function forecast(items: Pick<KpiItem, 'kind' | 'target_bad' | 'target_good' | 'target_great' | 'actual'>[]): Forecast | null {
  const scores = items.map(itemScore).filter((s): s is number => s !== null);
  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score, scenario: score >= 1.75 ? 'great' : score >= 0.85 ? 'good' : 'bad', scored: scores.length };
}
