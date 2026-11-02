// Maqsadlar v2 — client-safe period math, deadline chips and the bot's daily
// report text. Keys: day 'YYYY-MM-DD', week = its Monday 'YYYY-MM-DD',
// month 'YYYY-MM'. Sunday is a day off: a daily goal never lands on it.
import { addDaysToKey } from '@/lib/time';

export type GoalScope = 'day' | 'week' | 'month';

export type GoalItem = {
  id: string;
  scope: GoalScope;
  title: string;
  done: boolean;
  /** 'HH:MM' Tashkent, when it was ticked. */
  doneAt: string | null;
  dueDate: string | null;
  dueTime: string | null;
  priority: boolean;
  /** How many times it has moved to a later period. */
  carry: number;
  movedFrom: string | null;
};

export const NEXT_LABEL: Record<GoalScope, string> = { day: 'Ertaga', week: 'Keyingi haftaga', month: 'Keyingi oyga' };
const CARRY_UNIT: Record<GoalScope, string> = { day: 'kun', week: 'hafta', month: 'oy' };

const dow = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`).getUTCDay();

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Monday of the week a day key falls in. */
export function weekKeyOf(dayKey: string): string {
  return addDaysToKey(dayKey, -((dow(dayKey) + 6) % 7));
}

export function periodKeysFor(dayKey: string): Record<GoalScope, string> {
  return { day: dayKey, week: weekKeyOf(dayKey), month: dayKey.slice(0, 7) };
}

/** The working day a daily goal lands on: Sunday moves to Monday. */
export function workingDay(dayKey: string): string {
  return dow(dayKey) === 0 ? addDaysToKey(dayKey, 1) : dayKey;
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function nextPeriodKey(scope: GoalScope, key: string): string {
  if (scope === 'day') return workingDay(addDaysToKey(key, 1));
  if (scope === 'week') return addDaysToKey(key, 7);
  return addMonths(key, 1);
}

/** Where a deadline goes when its goal moves from period `from` to `to`. */
export function shiftDue(scope: GoalScope, due: string | null, from: string, to: string): string | null {
  if (!due) return null;
  if (scope === 'day') return to;
  if (scope === 'week') {
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    return addDaysToKey(due, days);
  }
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const ym = addMonths(due.slice(0, 7), (ty - fy) * 12 + (tm - fm));
  const last = lastDayOfMonth(ym);
  const day = `${ym}-${due.slice(8, 10)}`;
  return day > last ? last : day;
}

export function carryLabel(scope: GoalScope, carry: number): string {
  return `↻ ${carry}-${CARRY_UNIT[scope]} ko‘chmoqda`;
}

export type DueChip = { text: string; tone: 'neutral' | 'soon' | 'late' | 'ok' };

/** The deadline chip. `now` is null before the client has a clock (SSR),
 * which renders the plain deadline only — no "qoldi" that could mismatch. */
export function dueChip(g: GoalItem, now: { day: string; clock: string } | null): DueChip | null {
  if (!g.dueDate) return null;
  if (g.done) {
    const late = g.doneAt && g.dueTime ? g.doneAt > g.dueTime : false;
    return late ? { text: 'kechikib bajarildi', tone: 'neutral' } : { text: '✓ muddatida', tone: 'ok' };
  }
  const [, m, d] = g.dueDate.split('-');
  if (g.dueTime && (g.scope === 'day' || (now && g.dueDate === now.day))) {
    if (!now) return { text: `⏰ ${g.dueTime}`, tone: 'neutral' };
    if (g.dueDate < now.day || (g.dueDate === now.day && g.dueTime <= now.clock)) return { text: `${g.dueTime} · muddat o‘tdi`, tone: 'late' };
    if (g.dueDate > now.day) return { text: `⏰ ${d}.${m} ${g.dueTime}`, tone: 'neutral' };
    const mins = toMin(g.dueTime) - toMin(now.clock);
    if (mins > 120) return { text: `⏰ ${g.dueTime}`, tone: 'neutral' };
    return { text: `⏰ ${g.dueTime} · ${mins >= 60 ? `${Math.floor(mins / 60)} soat ` : ''}${mins % 60} daq qoldi`, tone: 'soon' };
  }
  if (!now) return { text: `📅 ${d}.${m}`, tone: 'neutral' };
  const days = Math.round((Date.parse(`${g.dueDate}T00:00:00Z`) - Date.parse(`${now.day}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { text: `📅 ${d}.${m} · muddat o‘tdi`, tone: 'late' };
  if (days === 0) return { text: `📅 bugun`, tone: 'soon' };
  return { text: `📅 ${d}.${m} · ${days} kun qoldi`, tone: days <= 2 ? 'soon' : 'neutral' };
}

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Open first, then ★, then deadline, then the order they were added. */
export function sortGoals(list: GoalItem[]): GoalItem[] {
  return list
    .map((g, i) => ({ g, i }))
    .sort((a, b) => {
      if (a.g.done !== b.g.done) return a.g.done ? 1 : -1;
      if (a.g.priority !== b.g.priority) return a.g.priority ? -1 : 1;
      const ad = a.g.dueDate ? `${a.g.dueDate} ${a.g.dueTime ?? '99'}` : '~';
      const bd = b.g.dueDate ? `${b.g.dueDate} ${b.g.dueTime ?? '99'}` : '~';
      return ad === bd ? a.i - b.i : ad < bd ? -1 : 1;
    })
    .map((x) => x.g);
}

/* ------------------------------------------------------------ bot report */

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

export function formatDayUz(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  return `${d}.${m}.${y}, ${WEEKDAYS[dow(dayKey)]}`;
}

export function progressBar(done: number, total: number, cells = 10): string {
  const n = total > 0 ? Math.round((done / total) * cells) : 0;
  return '▰'.repeat(n) + '▱'.repeat(cells - n);
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export type ReportInput = {
  dayKey: string;
  /** Clock at send time, to tell an open deadline from a missed one. */
  clock: string;
  name: string;
  goals: GoalItem[];
  week: { done: number; total: number };
  streak: number;
};

/** The personal 21:00 message. Returns null when there is nothing to report. */
export function buildDailyReport(r: ReportInput): string | null {
  if (!r.goals.length) return null;
  const done = sortGoals(r.goals.filter((g) => g.done));
  const open = sortGoals(r.goals.filter((g) => !g.done));
  const total = r.goals.length;
  const pct = Math.round((done.length / total) * 100);
  const next = workingDay(addDaysToKey(r.dayKey, 1)) === addDaysToKey(r.dayKey, 1) ? 'Ertaga' : 'Dushanbaga';
  const star = (g: GoalItem) => (g.priority ? '★ ' : '');

  const parts = [
    `📊 <b>Kunlik maqsadlar hisoboti</b>`,
    `🗓 ${formatDayUz(r.dayKey)} · ${esc(r.name)}`,
    '',
    `<b>Natija: ${done.length} / ${total} · ${pct}%</b>`,
    progressBar(done.length, total),
  ];
  if (done.length) {
    parts.push('', `✅ <b>Bajarildi (${done.length})</b>`);
    for (const g of done) {
      const onTime = g.dueTime && g.doneAt ? (g.doneAt <= g.dueTime ? ' <i>(muddatida)</i>' : ' <i>(kechikib)</i>') : '';
      parts.push(`• ${star(g)}${esc(g.title)}${g.doneAt ? ` — ${g.doneAt}` : ''}${onTime}`);
    }
  }
  if (open.length) {
    parts.push('', `⏳ <b>${next} o‘tadi (${open.length})</b>`);
    for (const g of open) {
      const missed = g.dueTime && g.dueTime <= r.clock ? ` — muddat ${g.dueTime} dan <b>o‘tdi</b>` : '';
      const carry = g.carry >= 1 ? ` — ↻ <b>${g.carry + 1}-kun</b> ko‘chmoqda` : '';
      parts.push(`• ${star(g)}${esc(g.title)}${missed}${carry}`);
    }
  }
  if (r.week.total > 0) {
    const wp = Math.round((r.week.done / r.week.total) * 100);
    parts.push('', `📈 Hafta: ${r.week.done} / ${r.week.total} · ${wp}%${r.streak >= 2 ? ` · seriya 🔥 ${r.streak} kun` : ''}`);
  }
  if (open.some((g) => g.carry >= 2)) parts.push('💡 3 kundan beri ko‘chayotgan maqsadni bo‘lib yoki o‘chirib qo‘ying.');
  else if (!open.length) parts.push('🎉 Barcha maqsadlar bajarildi. Zo‘r ish!');
  return parts.join('\n');
}

/** Days in a row, ending today, with at least one goal done (Sundays skipped). */
export function doneStreak(doneDays: Set<string>, today: string): number {
  let n = 0;
  for (let k = today; ; k = addDaysToKey(k, -1)) {
    if (dow(k) === 0) continue;
    if (!doneDays.has(k)) return n;
    n++;
    if (n > 366) return n;
  }
}
