export type KpiMetric = { id: string; weight_percentage: number };
export type KpiEntry = { metric_id: string; target_value: number; actual_value: number | null };

/** Weighted-average achievement across a set of metrics for a single
 * month. Each metric's achievement is actual/target (capped at 150% so one
 * metric massively overshooting its target can't single-handedly carry the
 * whole score), then averaged by weight — deliberately not divided by a
 * fixed 100, since weights aren't required to sum to exactly 100 and this
 * keeps the score meaningful even when a CEO temporarily over/under-weights
 * a scorecard. Metrics missing an actual value (not filled in yet) are
 * excluded rather than counted as 0. Returns null when nothing is scoreable
 * yet. */
export function computeKpiScore(metrics: KpiMetric[], entries: KpiEntry[]): number | null {
  const entryByMetric = new Map(entries.map((e) => [e.metric_id, e]));
  let weightedSum = 0;
  let weightTotal = 0;
  for (const metric of metrics) {
    const entry = entryByMetric.get(metric.id);
    if (!entry || entry.actual_value == null || entry.target_value === 0) continue;
    const achievement = Math.min(entry.actual_value / entry.target_value, 1.5) * 100;
    weightedSum += metric.weight_percentage * achievement;
    weightTotal += metric.weight_percentage;
  }
  return weightTotal > 0 ? weightedSum / weightTotal : null;
}
