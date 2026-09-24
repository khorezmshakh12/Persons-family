/**
 * Live task countdown — pure formatting, shared by the client chip
 * (components/tasks/task-countdown.tsx) and tests/countdown.test.ts.
 *
 * Semantics match the server exactly:
 *   - `tasks.deadline` is a `timestamptz` — an absolute instant the CEO picked
 *     in the assign/edit dialog, not a date with an implied end-of-day. So
 *     the countdown is a plain `deadline − now` in milliseconds; no Tashkent
 *     calendar maths is involved (the display zone does not change *when*
 *     an instant is).
 *   - A task is overdue once `deadline < now()` (getVisibleTasksAction's
 *     `is_overdue`, the task-overdue-penalties cron). So `diff === 0` is still
 *     on time and the sign flips on the first millisecond past the deadline.
 *   - Finished late means `completed_at > deadline` (settleTaskStars), so
 *     completing exactly at the deadline is on time.
 */

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** 'ok' = plenty of time, 'warn' = under 24h left, 'bad' = overdue. */
export type CountdownTone = 'ok' | 'warn' | 'bad';

export type Countdown = {
  /** e.g. "2k 04:13:09", "18:00:00", "−00:05:12" (U+2212 minus). */
  text: string;
  tone: CountdownTone;
  overdue: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Format the time left until `deadlineMs` as of `nowMs`. */
export function formatCountdown(deadlineMs: number, nowMs: number): Countdown {
  const diff = deadlineMs - nowMs;
  const overdue = diff < 0;
  // Remaining time rounds *up* (so the display reaches 00:00:01, never a
  // premature 00:00:00 while the task is still on time); elapsed-overdue
  // time rounds down (whole seconds actually past the deadline).
  const totalSec = overdue ? Math.floor(-diff / SECOND_MS) : Math.ceil(diff / SECOND_MS);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const text =
    (overdue ? '−' : '') + (days ? `${days}k ` : '') + `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  const tone: CountdownTone = overdue ? 'bad' : diff < DAY_MS ? 'warn' : 'ok';
  return { text, tone, overdue };
}

/**
 * Epoch ms of a timestamptz value as it reaches the client. db/client.ts
 * hands timestamps through as the raw Postgres wire string
 * ("2026-09-24 18:00:00+05", "… 13:00:00.123456+00"), which V8 parses but
 * stricter engines (Safari) may not — normalise to ISO 8601 first. NaN when
 * unparseable.
 */
export function parseInstant(value: string | null | undefined): number {
  if (!value) return Number.NaN;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(value.trim());
  if (!m) return Date.parse(value);
  const [, date, time, frac = '', zone = 'Z'] = m;
  const ms = frac ? frac.slice(0, 4).padEnd(4, '0') : '';
  const tz = /^[+-]\d{2}$/.test(zone) ? `${zone}:00` : /^[+-]\d{4}$/.test(zone) ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone.toUpperCase();
  return Date.parse(`${date}T${time}${ms}${tz}`);
}

/**
 * For a done task: was it finished on time? `null` when either instant is
 * missing/unparseable — the caller shows nothing rather than guessing.
 */
export function finishedOnTime(deadline: string | null | undefined, completedAt: string | null | undefined): boolean | null {
  if (!deadline || !completedAt) return null;
  const d = parseInstant(deadline);
  const c = parseInstant(completedAt);
  if (!Number.isFinite(d) || !Number.isFinite(c)) return null;
  return c <= d;
}
