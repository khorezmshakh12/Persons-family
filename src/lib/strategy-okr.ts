/** Strategy OKRs — shared (client + server) types and maths. */

export const OKR_METRICS = {
  manual: { n: 'Qo‘lda kiritiladi', unit: '', hint: 'Qiymatni o‘zingiz yangilab borasiz' },
  leads_month: { n: 'Yangi lidlar (shu oy)', unit: 'ta', hint: 'Operatsiya HQ › Lidlar' },
  enrolled_month: { n: 'Yozilgan o‘quvchilar (shu oy)', unit: 'ta', hint: 'Lid «yozildi» bosqichiga o‘tgan' },
  conversion_month: { n: 'Lid → o‘quvchi konversiyasi (shu oy)', unit: '%', hint: 'Yozilganlar ÷ yangi lidlar' },
  students_total: { n: 'Faol o‘quvchilar', unit: 'ta', hint: 'Hisob-kitob › kurslar bo‘yicha' },
  revenue_month: { n: 'Daromad (shu oy)', unit: 'mln', hint: 'Jurnaldagi daromad hisoblari · faqat CEO/COO' },
  strategy_done_pct: { n: 'Strategiya vazifalari bajarilishi', unit: '%', hint: 'Shu maydondagi vazifalar' },
  tasks_done_month: { n: 'Bajarilgan vazifalar (shu oy)', unit: 'ta', hint: 'Vazifalar bo‘limi, butun jamoa' },
  issues_resolved_month: { n: 'Hal qilingan muammolar (shu oy)', unit: 'ta', hint: 'Muammolar bo‘limi' },
  staff_active: { n: 'Faol xodimlar', unit: 'ta', hint: 'Xodimlar ro‘yxati' },
} as const;

export type OkrMetric = keyof typeof OKR_METRICS;
export const OKR_METRIC_IDS = Object.keys(OKR_METRICS) as OkrMetric[];
/** Metrics that reveal company money — only strategy.finance sees their values. */
export const FINANCE_METRICS: OkrMetric[] = ['revenue_month'];

export type KeyResult = {
  id: string;
  objective_id: string;
  title: string;
  metric: OkrMetric;
  start_value: number;
  target_value: number;
  /** Live value for auto metrics, the typed value for manual ones; null = hidden (finance). */
  current: number | null;
  unit: string;
};

export type Objective = {
  id: string;
  space_id: string;
  title: string;
  owner_id: string | null;
  krs: KeyResult[];
};

export type OkrHealth = 'ok' | 'risk' | 'off' | 'none';

/** 0–100 progress of one key result from start toward target (either direction). */
export function krProgress(kr: Pick<KeyResult, 'start_value' | 'target_value' | 'current'>): number | null {
  if (kr.current === null) return null;
  const span = kr.target_value - kr.start_value;
  if (span === 0) return kr.current >= kr.target_value ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round(((kr.current - kr.start_value) / span) * 100)));
}

export function objectiveProgress(o: Objective): number | null {
  const ps = o.krs.map(krProgress).filter((p): p is number => p !== null);
  return ps.length ? Math.round(ps.reduce((a, b) => a + b, 0) / ps.length) : null;
}

/** Progress against the share of the space's timeline already elapsed. */
export function okrHealth(progress: number | null, elapsedPct: number): OkrHealth {
  if (progress === null) return 'none';
  if (progress >= 100 || progress >= elapsedPct - 10) return 'ok';
  if (progress >= elapsedPct - 30) return 'risk';
  return 'off';
}

export const HEALTH_LABEL: Record<OkrHealth, string> = {
  ok: 'Rejada',
  risk: 'Xavf ostida',
  off: 'Orqada',
  none: 'Ma’lumot yo‘q',
};

export function fmtKr(v: number | null, unit: string): string {
  if (v === null) return '—';
  const n = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${n.toLocaleString('ru-RU').replace(/,/g, '.')}${unit ? (unit === '%' ? '%' : ` ${unit}`) : ''}`;
}
