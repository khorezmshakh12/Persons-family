/**
 * Intake statistics — pure. Leads are counted, never managed: this is a
 * staff CRM (see the staff-crm-scope note), so everything here aggregates —
 * no per-person rankings, no contact history. Tested in tests/intake.test.ts.
 *
 * Funnel numbers are cohort-based: of the leads that ARRIVED in the period,
 * how many reached a trial / enrolled (so a period's conversion never
 * exceeds 100%). "Enrolled in period" (by enrolment date) is separate and is
 * what the monthly contract target is measured against.
 */
import { tashkentDayKey } from '@/lib/time';

export const SOURCES = ['instagram', 'meta', 'telegram', 'google', 'referral', 'walkin', 'website', 'other'] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_META: Record<Source, { n: string; c: string }> = {
  instagram: { n: 'Instagram', c: '#e1306c' },
  meta: { n: 'Meta reklama', c: '#1877f2' },
  telegram: { n: 'Telegram', c: '#229ed9' },
  google: { n: 'Google', c: '#34a853' },
  referral: { n: 'Tavsiya', c: '#7c5cff' },
  walkin: { n: 'O‘zi keldi', c: '#ff9f1c' },
  website: { n: 'Sayt', c: '#0fa3b1' },
  other: { n: 'Boshqa', c: '#8d99ae' },
};

export const STAGES = ['new', 'contacted', 'trial', 'enrolled', 'lost'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Yangi',
  contacted: 'Bog‘lanildi',
  trial: 'Sinov darsi',
  enrolled: 'Yozildi',
  lost: 'Yo‘qotildi',
};

export const LOST_REASONS = ['Narx qimmat', 'Vaqt to‘g‘ri kelmadi', 'Boshqa markaz', 'Javob bermadi', 'Hali o‘ylayapti', 'Joylashuv uzoq'];

export type LeadRow = {
  id: string;
  created_at: string;
  stage: Stage;
  source: Source;
  course: string;
  campaign: string | null;
  lost_reason: string | null;
  trial_at: string | null;
  enrolled_at: string | null;
};

const ms = (s: string) => new Date(s).getTime();
const reachedTrial = (l: LeadRow) => !!l.trial_at || l.stage === 'trial' || l.stage === 'enrolled' || !!l.enrolled_at;
const reachedContact = (l: LeadRow) => (l.stage !== 'new' && l.stage !== 'lost') || reachedTrial(l);
const enrolled = (l: LeadRow) => !!l.enrolled_at || l.stage === 'enrolled';

export type Window = { from: string; to: string }; // ISO instants, `to` exclusive
const inWin = (at: string | null, w: Window) => !!at && ms(at) >= ms(w.from) && ms(at) < ms(w.to);

export type Funnel = { leads: number; contacted: number; trial: number; enrolled: number; lost: number; conv: number | null; trialConv: number | null; avgDays: number | null };

export function funnel(rows: LeadRow[], w: Window): Funnel {
  const c = rows.filter((l) => inWin(l.created_at, w));
  const e = c.filter(enrolled);
  const days = e.filter((l) => l.enrolled_at).map((l) => (ms(l.enrolled_at!) - ms(l.created_at)) / 86_400_000);
  const trial = c.filter(reachedTrial).length;
  return {
    leads: c.length,
    contacted: c.filter(reachedContact).length,
    trial,
    enrolled: e.length,
    lost: c.filter((l) => l.stage === 'lost').length,
    conv: c.length ? (e.length / c.length) * 100 : null,
    trialConv: trial ? (e.length / trial) * 100 : null,
    avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
  };
}

/** Enrolments that happened inside the window (any arrival date). */
export const enrolledIn = (rows: LeadRow[], w: Window) => rows.filter((l) => inWin(l.enrolled_at, w)).length;

export type SourceRow = { source: Source; leads: number; enrolled: number; conv: number | null; spend: number; cpl: number | null; cac: number | null; trend: number[] };

/** Per source over the window, with an 8-week arrivals trend. */
export function sourceMatrix(rows: LeadRow[], w: Window, spend: Partial<Record<Source, number>>, weeks: Window[]): SourceRow[] {
  return SOURCES.map((source) => {
    const s = rows.filter((l) => l.source === source);
    const f = funnel(s, w);
    const sp = spend[source] ?? 0;
    return {
      source,
      leads: f.leads,
      enrolled: f.enrolled,
      conv: f.conv,
      spend: sp,
      cpl: f.leads && sp ? sp / f.leads : null,
      cac: f.enrolled && sp ? sp / f.enrolled : null,
      trend: weeks.map((wk) => s.filter((l) => inWin(l.created_at, wk)).length),
    };
  })
    .filter((r) => r.leads || r.spend || r.trend.some(Boolean))
    .sort((a, b) => b.leads - a.leads);
}

/** Weekday (0 = Mon) × hour, Tashkent, of arrivals. */
export function heatmap(rows: LeadRow[], w: Window): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const l of rows) {
    if (!inWin(l.created_at, w)) continue;
    const t = new Date(ms(l.created_at) + 5 * 3_600_000);
    grid[(t.getUTCDay() + 6) % 7][t.getUTCHours()]++;
  }
  return grid;
}

/** Arrival-month cohorts: cumulative enrolment % after 0..n months. */
export function cohorts(rows: LeadRow[], months: string[], horizon = 4): { month: string; size: number; pct: (number | null)[] }[] {
  const key = (s: string) => tashkentDayKey(new Date(s)).slice(0, 7);
  const idx = (m: string) => {
    const [y, mo] = m.split('-').map(Number);
    return y * 12 + mo;
  };
  const last = idx(months[months.length - 1]);
  return months.map((m) => {
    const c = rows.filter((l) => key(l.created_at) === m);
    const pct = Array.from({ length: horizon + 1 }, (_, k) => {
      if (idx(m) + k > last) return null;
      if (!c.length) return null;
      const n = c.filter((l) => l.enrolled_at && idx(key(l.enrolled_at)) <= idx(m) + k).length;
      return (n / c.length) * 100;
    });
    return { month: m, size: c.length, pct };
  });
}

export function lostReasons(rows: LeadRow[], w: Window): { reason: string; n: number }[] {
  const m = new Map<string, number>();
  for (const l of rows) if (l.stage === 'lost' && inWin(l.created_at, w)) m.set(l.lost_reason || 'Sabab ko‘rsatilmagan', (m.get(l.lost_reason || 'Sabab ko‘rsatilmagan') ?? 0) + 1);
  return [...m.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n);
}

export type Pace = { actual: number; target: number; forecast: number; needPerDay: number | null; pct: number | null };

/** Month-to-date vs target, straight-line forecast to month end. */
export function pace(actual: number, target: number, dayOfMonth: number, daysInMonth: number): Pace {
  const forecast = dayOfMonth > 0 ? Math.round((actual / dayOfMonth) * daysInMonth) : actual;
  const left = daysInMonth - dayOfMonth;
  return {
    actual,
    target,
    forecast,
    needPerDay: target > actual && left > 0 ? (target - actual) / left : null,
    pct: target ? (forecast / target) * 100 : null,
  };
}

export type Alert = { id: string; tone: 'risk' | 'good'; text: string };

/** Plain-language warnings from the numbers (Jev may rank them). */
export function alerts(now: Funnel, prev: Funnel, src: SourceRow[], leadPace: Pace, wonPace: Pace): Alert[] {
  const out: Alert[] = [];
  if (wonPace.pct !== null && wonPace.pct < 80)
    out.push({ id: 'won-pace', tone: 'risk', text: `Shartnoma rejasi xavf ostida: prognoz ${wonPace.forecast} / ${wonPace.target} (${Math.round(wonPace.pct)}%)` });
  if (leadPace.pct !== null && leadPace.pct < 80)
    out.push({ id: 'lead-pace', tone: 'risk', text: `Kelganlar rejasi orqada: prognoz ${leadPace.forecast} / ${leadPace.target}` });
  if (now.conv !== null && prev.conv !== null && now.conv - prev.conv <= -10)
    out.push({ id: 'conv', tone: 'risk', text: `Konversiya ${Math.round(prev.conv)}% dan ${Math.round(now.conv)}% ga tushdi` });
  if (now.conv !== null && prev.conv !== null && now.conv - prev.conv >= 10)
    out.push({ id: 'conv', tone: 'good', text: `Konversiya ${Math.round(now.conv - prev.conv)} p.p. oshdi` });
  for (const s of src) {
    const t = s.trend.slice(-4);
    if (t.length === 4 && t[0] > t[1] && t[1] > t[2] && t[2] > t[3])
      out.push({ id: `fall-${s.source}`, tone: 'risk', text: `${SOURCE_META[s.source].n}dan kelganlar 3 hafta ketma-ket kamaymoqda (${t.join(' → ')})` });
    if (s.spend > 0 && s.leads === 0) out.push({ id: `waste-${s.source}`, tone: 'risk', text: `${SOURCE_META[s.source].n}ga xarajat bor, lekin kelgan yo‘q` });
  }
  return out;
}

/** Tashkent day helpers for windows. */
export function monthWindow(monthKey: string, tashkentMidnight: (k: string) => Date): Window {
  const [y, m] = monthKey.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { from: tashkentMidnight(`${monthKey}-01`).toISOString(), to: tashkentMidnight(next).toISOString() };
}

export function pct(v: number | null) {
  return v === null ? '—' : `${Math.round(v)}%`;
}
