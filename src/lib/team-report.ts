/**
 * Team report — pure parts: the metric catalogue, period buckets (Tashkent
 * days as 'YYYY-MM-DD' keys) and the rule-based insights Jev later ranks.
 * Tested in tests/team-report.test.ts. Data lives in team-report-data.ts.
 */

export const RANGES = ['week', 'month', 'quarter'] as const;
export type Range = (typeof RANGES)[number];
export const RANGE_LABEL: Record<Range, string> = { week: 'Hafta', month: 'Oy', quarter: 'Chorak' };

export const METRICS = [
  'tasksDone',
  'onTime',
  'missed',
  'issuesNew',
  'issuesResolved',
  'leads',
  'enrolled',
  'selfDevRate',
  'kpiAvg',
] as const;
export type Metric = (typeof METRICS)[number];

/** `good`: which direction is better (for colouring deltas). */
export const METRIC_META: Record<Metric, { n: string; unit: '' | '%' | 'pp'; good: 'up' | 'down'; hint: string; href: string }> = {
  tasksDone: { n: 'Bajarilgan vazifalar', unit: '', good: 'up', hint: 'CEO tasdiqlagan vazifalar soni', href: '/tasks' },
  onTime: { n: 'O‘z vaqtida', unit: '%', good: 'up', hint: 'Bajarilganlardan muddatigacha topshirilgani', href: '/tasks' },
  missed: { n: 'Muddati o‘tganlar', unit: '', good: 'down', hint: 'Muddati shu davrga tushib, vaqtida bajarilmagan vazifalar', href: '/tasks' },
  issuesNew: { n: 'Yangi muammolar', unit: '', good: 'down', hint: 'Ochilgan muammolar', href: '/issues' },
  issuesResolved: { n: 'Hal qilingan muammolar', unit: '', good: 'up', hint: 'Yopilgan muammolar', href: '/issues' },
  leads: { n: 'Kelganlar', unit: '', good: 'up', hint: 'Yangi murojaatlar (statistika)', href: '/operations' },
  enrolled: { n: 'O‘qishga yozilganlar', unit: '', good: 'up', hint: 'Shu davrda yozilganlar', href: '/operations' },
  selfDevRate: { n: 'O‘zini rivojlantirish', unit: '%', good: 'up', hint: 'Oy hisobotini topshirgan xodimlar ulushi', href: '/self-development' },
  kpiAvg: { n: 'O‘rtacha KPI', unit: '%', good: 'up', hint: 'Baholangan KPI rejalarining o‘rtacha foizi', href: '/my-kpi' },
};

export type Bucket = { key: string; label: string; start: string; end: string };

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

/** `count` consecutive buckets ending with the one containing `today`;
 * `end` is exclusive. Weeks start on Monday. */
export function buckets(range: Range, today: string, count = 8): Bucket[] {
  let start: string;
  if (range === 'week') {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    start = addDays(today, -((dow + 6) % 7));
  } else {
    const [y, m] = today.split('-').map(Number);
    const m0 = range === 'quarter' ? Math.floor((m - 1) / 3) * 3 + 1 : m;
    start = `${y}-${String(m0).padStart(2, '0')}-01`;
  }
  const step = (k: string, n: number) => (range === 'week' ? addDays(k, 7 * n) : addMonths(k, (range === 'quarter' ? 3 : 1) * n));
  return Array.from({ length: count }, (_, i) => {
    const s = step(start, i - (count - 1));
    const e = step(s, 1);
    const [y, m, d] = s.split('-').map(Number);
    const label =
      range === 'week' ? `${d} ${MONTHS[m - 1]}` : range === 'month' ? `${MONTHS[m - 1]} ${String(y).slice(2)}` : `${Math.floor((m - 1) / 3) + 1}-ch ${String(y).slice(2)}`;
    return { key: s, label, start: s, end: e };
  });
}

export type Series = Record<Metric, (number | null)[]>;

/** Change of the last bucket vs the one before (absolute for %, relative
 * share otherwise); null when there is nothing to compare. */
export function change(values: (number | null)[], unit: string): number | null {
  const n = values.length;
  const a = values[n - 1];
  const b = values[n - 2];
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (unit === '%') return a - b;
  if (b === 0) return a === 0 ? 0 : null;
  return (a - b) / b;
}

export type Insight = { id: string; tone: 'good' | 'risk' | 'action'; text: string; metric?: Metric; weight: number };

export type DeptRow = {
  dept: string;
  people: number;
  tasksDone: number;
  onTime: number | null;
  overdueNow: number;
  selfDevRate: number | null;
  kpiAvg: number | null;
};

export type AttentionRow = { staffId: string; name: string; dept: string; reasons: string[] };

/** Plain-language findings from the numbers; Jev only re-orders them. */
export function insights(series: Series, labels: string[], depts: DeptRow[], attention: AttentionRow[], dayOfMonth: number): Insight[] {
  const out: Insight[] = [];
  const last = (m: Metric) => series[m][series[m].length - 1];
  const ch = (m: Metric) => change(series[m], METRIC_META[m].unit);
  const now = labels[labels.length - 1];

  const onTime = last('onTime');
  const dOn = ch('onTime');
  if (onTime !== null && dOn !== null && Math.abs(dOn) >= 5)
    out.push({
      id: 'onTime',
      tone: dOn > 0 ? 'good' : 'risk',
      metric: 'onTime',
      weight: Math.abs(dOn),
      text: `${now}: vazifalarning ${Math.round(onTime)}% o‘z vaqtida topshirildi (${dOn > 0 ? '+' : ''}${Math.round(dOn)} p.p.)`,
    });
  const missed = last('missed');
  if (missed && missed > 0)
    out.push({ id: 'missed', tone: 'risk', metric: 'missed', weight: 10 + missed * 2, text: `${missed} ta vazifa muddatida bajarilmadi` });
  const done = ch('tasksDone');
  if (done !== null && Math.abs(done) >= 0.2)
    out.push({
      id: 'tasksDone',
      tone: done > 0 ? 'good' : 'risk',
      metric: 'tasksDone',
      weight: Math.abs(done) * 40,
      text: `Bajarilgan vazifalar ${done > 0 ? 'oshdi' : 'kamaydi'}: ${Math.round(Math.abs(done) * 100)}%`,
    });
  const inew = last('issuesNew') ?? 0;
  const ires = last('issuesResolved') ?? 0;
  if (inew > ires && inew - ires >= 2)
    out.push({ id: 'issues', tone: 'risk', metric: 'issuesNew', weight: (inew - ires) * 4, text: `Muammolar to‘planmoqda: ${inew} ta yangi, ${ires} ta hal qilindi` });
  else if (ires > inew && ires >= 2)
    out.push({ id: 'issues', tone: 'good', metric: 'issuesResolved', weight: (ires - inew) * 3, text: `Muammolar kamaymoqda: ${ires} ta hal qilindi, ${inew} ta yangi` });
  const leads = ch('leads');
  if (leads !== null && Math.abs(leads) >= 0.25)
    out.push({
      id: 'leads',
      tone: leads > 0 ? 'good' : 'risk',
      metric: 'leads',
      weight: Math.abs(leads) * 30,
      text: `Kelganlar ${leads > 0 ? 'ko‘paydi' : 'kamaydi'}: ${Math.round(Math.abs(leads) * 100)}%`,
    });
  const sd = last('selfDevRate');
  if (sd !== null && sd < 60 && dayOfMonth >= 20)
    out.push({ id: 'selfDev', tone: 'action', metric: 'selfDevRate', weight: 60 - sd, text: `Oy oxiri yaqin — xodimlarning faqat ${Math.round(sd)}% o‘zini rivojlantirish hisobotini topshirgan` });
  const worst = depts.filter((d) => d.onTime !== null && d.tasksDone >= 3).sort((a, b) => (a.onTime ?? 0) - (b.onTime ?? 0))[0];
  if (worst && (worst.onTime ?? 100) < 70)
    out.push({ id: 'dept', tone: 'risk', weight: 70 - (worst.onTime ?? 0), text: `${worst.dept} bo‘limida vazifalarning faqat ${Math.round(worst.onTime ?? 0)}% vaqtida bajarilgan` });
  if (attention.length)
    out.push({
      id: 'attention',
      tone: 'action',
      weight: 8 + attention.length,
      text: `${attention.length} xodimga e’tibor kerak: ${attention
        .slice(0, 3)
        .map((a) => a.name)
        .join(', ')}${attention.length > 3 ? '…' : ''}`,
    });
  return out.sort((a, b) => b.weight - a.weight);
}

export type ReportConfig = { metrics: Metric[]; range: Range; dept: string | null };

export function parseConfig(v: unknown): ReportConfig | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const metrics = Array.isArray(o.metrics) ? (o.metrics.filter((m) => (METRICS as readonly string[]).includes(m as string)) as Metric[]) : [];
  const range = (RANGES as readonly string[]).includes(o.range as string) ? (o.range as Range) : 'week';
  if (!metrics.length) return null;
  return { metrics, range, dept: typeof o.dept === 'string' && o.dept ? o.dept : null };
}

export function fmtMetric(v: number | null, unit: string): string {
  if (v === null) return '—';
  if (unit === '%') return `${Math.round(v)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
