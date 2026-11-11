// B-nuqta — xodimning OYLIK daromad maqsadi (owner, 2026-11-11).
// A-nuqta: yilning birinchi maoshli oyi (odatda yanvar); "hozir": joriy oy
// maoshi, u hali 0 bo'lsa oxirgi maoshli oy. Pure — server va klient uchun.

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

/** `byMonth[i]` = pay of month i (0 = January) of the B-nuqta's year; months
 * not reached yet must be 0. `upTo` = the current month index (0-based). */
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
