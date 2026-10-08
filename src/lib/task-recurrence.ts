/**
 * Recurring tasks — pure date maths, shared by the action and the cron.
 * Days are Tashkent day keys (YYYY-MM-DD).
 */
export type Every = 'weekly' | 'monthly';

/** Create the next instance this many days before its deadline. */
export const LEAD_DAYS: Record<Every, number> = { weekly: 2, monthly: 5 };

/** The deadline day after `lastDue`. Monthly keeps the day of month,
 * clamped to the month's length (31 → 30/28…). */
export function nextDue(lastDue: string, every: Every): string {
  const [y, m, d] = lastDue.split('-').map(Number);
  if (every === 'weekly') {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const len = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, len)).padStart(2, '0')}`;
}

/** Whether today (Tashkent key) is inside the creation window for `due`. */
export function isDueForCreation(today: string, due: string, every: Every): boolean {
  const [y, m, d] = due.split('-').map(Number);
  const open = new Date(Date.UTC(y, m - 1, d - LEAD_DAYS[every])).toISOString().slice(0, 10);
  return today >= open;
}
