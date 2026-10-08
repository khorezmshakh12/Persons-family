import { addDaysToKey, tashkentDayKey, tashkentMidnight, tashkentYmd } from '@/lib/time';

/**
 * One-line task entry for the assign dialog:
 *
 *   "Oylik hisobot @Ali ertaga 15:00 +10"
 *
 * - `@name`      → the first assignee whose first (or last) name starts with it
 * - `bugun` / `ertaga` / `indinga` / `25.10` → the deadline day (Tashkent)
 * - `15:00`      → the deadline time (default 18:00 when only a day is given)
 * - `+10`        → star reward
 * Everything else is the title. Pure and clock-injectable for tests.
 */
export type QuickTask = {
  title: string;
  assigneeId: string | null;
  /** UTC ISO instant, or null when no day/time was typed. */
  deadline: string | null;
  starReward: number | null;
};

type Person = { id: string; first_name: string; last_name: string };

const norm = (s: string) => s.toLowerCase().replace(/[‘’ʻʼ'`]/g, '');

const RELATIVE_DAYS: Record<string, number> = { bugun: 0, ertaga: 1, indinga: 2, today: 0, tomorrow: 1, сегодня: 0, завтра: 1 };

export function parseQuickTask(input: string, people: Person[], now: Date = new Date()): QuickTask {
  let assigneeId: string | null = null;
  let dayKey: string | null = null;
  let time: string | null = null;
  let starReward: number | null = null;
  const rest: string[] = [];

  for (const word of input.trim().split(/\s+/).filter(Boolean)) {
    const w = norm(word);
    if (w.startsWith('@') && w.length > 1 && !assigneeId) {
      const q = w.slice(1);
      const hit = people.find((p) => norm(p.first_name).startsWith(q) || norm(p.last_name).startsWith(q));
      if (hit) {
        assigneeId = hit.id;
        continue;
      }
    }
    if (w in RELATIVE_DAYS && !dayKey) {
      dayKey = addDaysToKey(tashkentDayKey(now), RELATIVE_DAYS[w]);
      continue;
    }
    const date = /^(\d{1,2})[./](\d{1,2})$/.exec(w);
    if (date && !dayKey) {
      const { year, month } = tashkentYmd(now);
      const m = Number(date[2]);
      const d = Number(date[1]);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        // A month already past means next year.
        const y = m < month ? year + 1 : year;
        dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        continue;
      }
    }
    const clock = /^(\d{1,2}):(\d{2})$/.exec(w);
    if (clock && !time && Number(clock[1]) < 24 && Number(clock[2]) < 60) {
      time = `${clock[1].padStart(2, '0')}:${clock[2]}`;
      continue;
    }
    const stars = /^\+(\d{1,4})$/.exec(w);
    if (stars && starReward === null) {
      starReward = Number(stars[1]);
      continue;
    }
    rest.push(word);
  }

  let deadline: string | null = null;
  if (dayKey || time) {
    const [h, m] = (time ?? '18:00').split(':').map(Number);
    const base = tashkentMidnight(dayKey ?? tashkentDayKey(now)).getTime();
    deadline = new Date(base + (h * 60 + m) * 60_000).toISOString();
  }

  return { title: rest.join(' '), assigneeId, deadline, starReward };
}
