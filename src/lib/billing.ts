// Oylik to'lov sanalari (2026-10-23): o'quvchi aktiv bo'lgan kun — har oyning
// to'lov kuni. Oyda bunday kun bo'lmasa (31 → fevral), oyning oxirgi kuni.
// Kalitlar 'YYYY-MM-DD' (Toshkent kuni), hisob UTC sanalarda — vaqt zonasi yo'q.

const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, '0');

/** The billing date in month `y`/`m` (1-12) for a given activation date. */
function dueIn(activation: string, y: number, m: number): string {
  const day = Math.min(Number(activation.slice(8, 10)), daysIn(y, m));
  return `${y}-${pad(m)}-${pad(day)}`;
}

function shift(y: number, m: number, by: number): [number, number] {
  const i = y * 12 + (m - 1) + by;
  return [Math.floor(i / 12), (i % 12) + 1];
}

/** Latest billing date on or before `today` (never before activation); null if not active yet. */
export function currentDueDate(activation: string, today: string): string | null {
  if (today < activation) return null;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const here = dueIn(activation, y, m);
  if (here <= today) return here < activation ? activation : here;
  const prev = dueIn(activation, ...shift(y, m, -1));
  return prev < activation ? activation : prev;
}

/** First billing date on or after `today` (the activation day itself if it is still ahead). */
export function nextDueDate(activation: string, today: string): string {
  if (today <= activation) return activation;
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const here = dueIn(activation, y, m);
  return here >= today ? here : dueIn(activation, ...shift(y, m, 1));
}

/** Whole days from `a` to `b` (both 'YYYY-MM-DD'). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Monthly fee after the student's discount, rounded to whole so'm. */
export function feeAfterDiscount(fee: number, discountPct: number): number {
  return Math.round((fee * (100 - Math.min(100, Math.max(0, discountPct)))) / 100);
}

export type ChargePart = { key: string; date: string; amount: number };

/**
 * The charges of one billing period. One part on the billing day, or two
 * halves (bo'lib to'lash): the second 15 days later, but before the next period.
 */
export function periodParts(activation: string, due: string, fee: number, installments: number): ChargePart[] {
  if (installments !== 2) return [{ key: due, date: due, amount: fee }];
  const half = Math.ceil(fee / 2);
  const next = nextDueDate(activation, addDays(due, 1));
  const second = addDays(due, 15) < next ? addDays(due, 15) : addDays(next, -1);
  return [
    { key: `${due}#1`, date: due, amount: half },
    { key: `${due}#2`, date: second, amount: fee - half },
  ];
}

function addDays(k: string, n: number): string {
  return new Date(Date.parse(`${k}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export type PayGrade = 'ok' | 'late' | 'hard';
/** openDays: days since the oldest charge not yet covered by payments (0 = nothing owed). */
export type GradeResult = { grade: PayGrade; onTime: number; total: number; avgDelay: number; openDays: number };

/**
 * To'lov bahosi. Payments cover charges oldest-first; each charge's delay is
 * the days from its date to the payment that covered it (or to today if still
 * open). Average of the last 4: ≤3 days — vaqtida, ≤14 — kechikadi, more (or
 * two months of debt) — to'lashi qiyin.
 */
export function gradeOf(
  charges: { date: string; amount: number }[],
  payments: { date: string; amount: number }[],
  today: string,
  debtMonths: number,
): GradeResult {
  const ch = [...charges].sort((a, b) => a.date.localeCompare(b.date));
  const pays = [...payments].filter((p) => p.amount > 0).sort((a, b) => a.date.localeCompare(b.date));
  const delays: number[] = [];
  let firstOpen: string | null = null;
  let pi = 0;
  let left = pays[0]?.amount ?? 0;
  for (const c of ch) {
    let need = c.amount;
    let paidAt: string | null = null;
    while (need > 0.5 && pi < pays.length) {
      const take = Math.min(need, left);
      need -= take;
      left -= take;
      if (need <= 0.5) paidAt = pays[pi].date;
      if (left <= 0.5) {
        pi++;
        left = pays[pi]?.amount ?? 0;
      }
    }
    if (!paidAt && !firstOpen) firstOpen = c.date;
    delays.push(Math.max(0, daysBetween(c.date, paidAt ?? today)));
  }
  const last = delays.slice(-4);
  const avgDelay = last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : 0;
  const grade: PayGrade = avgDelay > 14 || debtMonths >= 2 ? 'hard' : avgDelay > 3 ? 'late' : 'ok';
  return { grade, onTime: delays.filter((d) => d <= 3).length, total: delays.length, avgDelay, openDays: firstOpen ? Math.max(0, daysBetween(firstOpen, today)) : 0 };
}

/** Fills {ism} {ota_ona} {summa} {sana} {qarz} {tolandi} {havola} (students) and {kurs} {sinov_sana} {sinov_vaqt} (leads). */
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(ism|ota_ona|summa|sana|qarz|tolandi|havola|kurs|sinov_sana|sinov_vaqt)\}/g, (_, k: string) => vars[k] ?? '');
}
