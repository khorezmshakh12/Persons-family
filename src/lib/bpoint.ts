// B-nuqta — xodimning OYLIK daromad maqsadi (owner, 2026-11-11). Uchta
// muddat (owner, 2026-11-17): yarim yil, 1 yil, 3 yil — hammasi yil
// boshidan (yanvardan) hisoblanadi: 1 yil = yanvar–dekabr, 3 yil = shu
// yilning yanvaridan 36 oy, yarim yil = yanvar–iyun yoki iyul–dekabr. A-nuqta: oynaning birinchi maoshli oyi;
// "hozir": joriy oy, u hali 0 bo'lsa oxirgi maoshli oy. Pure — server va
// klient uchun.

export type Horizon = '6m' | '1y' | '3y';

export const HORIZONS: { key: Horizon; months: number; label: string }[] = [
  { key: '6m', months: 6, label: 'Yarim yil' },
  { key: '1y', months: 12, label: '1 yil' },
  { key: '3y', months: 36, label: '3 yil' },
];

export const isHorizon = (v: unknown): v is Horizon => v === '6m' || v === '1y' || v === '3y';

const MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const SHORT_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

/** 'YYYY-MM-01' shifted by `d` months. */
export function addMonths(period: string, d: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + d;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
}

/** Whole months from `a` to `b` ('YYYY-MM-01'); negative when b < a. */
export function monthsBetween(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}

/** First month of the window a goal set in `now` ('YYYY-MM-01') covers:
 * windows are counted from January of that year in steps of `months`, so
 * 1 yil / 3 yil start in January and yarim yil in January or July. */
export function windowStart(now: string, months: number): string {
  const jan = `${now.slice(0, 4)}-01-01`;
  return addMonths(jan, Math.floor(monthsBetween(jan, now) / months) * months);
}

/** "noyabr 2026" */
export const monthName = (period: string) => `${MONTHS_UZ[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
/** "Noy" */
export const monthShort = (period: string) => SHORT_UZ[Number(period.slice(5, 7)) - 1];

/** `count` months from `start` ('YYYY-MM-01'): what the person actually
 * RECEIVED for each month — salary payments + advances booked to it
 * (owner, 2026-11-17: "fond va to'lovlar"dagi to'langan summa). A month
 * nothing was paid for yet is 0, so "hozir" falls back to the last paid
 * month. The one input every B-nuqta view uses. */
export function bpointSeries(points: { period: string; paid: number }[], start: string, count: number): number[] {
  const out = new Array(count).fill(0) as number[];
  for (const p of points) {
    const i = monthsBetween(start, p.period.slice(0, 10));
    if (i >= 0 && i < count) out[i] = p.paid;
  }
  return out;
}

export type BpointProgress = {
  /** Monthly target (B). */
  target: number;
  /** Starting monthly pay (A); 0 when no month has pay yet. */
  start: number;
  /** 0-based month index of A, or -1. */
  startMonth: number;
  /** Latest monthly pay ("hozir"); 0 when no month has pay yet. */
  current: number;
  /** 0-based month index of `current`, or -1. */
  currentMonth: number;
  /** current / target, %. */
  pct: number;
  /** Share of the A→B road covered, 0–100. */
  road: number;
  /** How much more monthly pay is needed to reach B (≥ 0). */
  gap: number;
};

/** `byMonth[i]` = pay of month i of the goal's window; months not reached
 * yet must be 0. `upTo` = index of the current month in the window. */
export function bpointProgress(target: number, byMonth: number[], upTo: number): BpointProgress {
  const last = Math.min(upTo, byMonth.length - 1);
  let startMonth = -1;
  let currentMonth = -1;
  for (let i = 0; i <= last; i++) {
    if ((byMonth[i] ?? 0) > 0) {
      if (startMonth < 0) startMonth = i;
      currentMonth = i;
    }
  }
  const start = startMonth >= 0 ? byMonth[startMonth] : 0;
  const current = currentMonth >= 0 ? byMonth[currentMonth] : 0;
  const t = Math.max(0, target);
  const pct = t > 0 ? Math.round((current / t) * 100) : 0;
  let road = 0;
  if (t > 0 && current > 0) {
    if (current >= t) road = 100;
    else if (t > start) road = Math.round((Math.max(0, current - start) / (t - start)) * 100);
  }
  return { target: t, start, startMonth, current, currentMonth, pct, road, gap: Math.max(0, t - current) };
}
