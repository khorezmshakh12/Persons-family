import { TASHKENT_OFFSET_MS } from '@/lib/time';

/**
 * A `datetime-local` value ("YYYY-MM-DDTHH:mm") carries no timezone of its
 * own, and the whole staff's business time is Asia/Tashkent (see
 * lib/time.ts) — so both directions here explicitly anchor to Tashkent
 * (UTC+5, no DST) rather than to whatever timezone the browser's own OS
 * happens to be set to.
 *
 * That distinction is not cosmetic: `new Date("2026-09-15T18:00")` /
 * `date.getHours()` parse and read in the *runtime's local* offset, which
 * is only Tashkent if the device's clock is actually set there. A CEO on a
 * machine set to a different zone (a default-UTC company image, a VM, a
 * trip abroad — Persons staff, but not necessarily their laptop's clock)
 * would have every deadline they typed silently shifted by that offset.
 * The task's on-time/late verdict (settleTaskStars in actions/tasks.ts)
 * compares that stored deadline against the DB's own clock — an instant a
 * few hours off is exactly enough to flip a genuinely on-time completion
 * into "late", which usually has no configured penalty and so just settles
 * into nothing: done, but no star ever lands. This was reported as one
 * employee's stars "not being accepted"; the bug is in every deadline ever
 * entered from a non-Tashkent device, not that one person's data.
 */

/** Converts an ISO instant to the Tashkent wall-clock string a
 * `<input type="datetime-local">` expects, so the picker shows what the
 * deadline actually means in Asia/Tashkent regardless of the viewer's own
 * device timezone. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** The inverse: reads the `datetime-local` value's digits as Tashkent
 * wall-clock time explicitly (never the runtime's own `Date` parsing,
 * which would use whatever zone the device itself is set to) and returns
 * the correct UTC instant. */
export function fromDatetimeLocalValue(value: string): string {
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = (timePart ?? '00:00').split(':').map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - TASHKENT_OFFSET_MS;
  return new Date(utcMs).toISOString();
}
