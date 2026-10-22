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
