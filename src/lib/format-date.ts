/** Converts an ISO timestamp to the local-time string a
 * `<input type="datetime-local">` expects ("YYYY-MM-DDTHH:mm") — the input
 * has no timezone concept, so this intentionally renders in the browser's
 * local time, matching what the user sees and would re-submit unchanged. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The inverse: a `datetime-local` value ("YYYY-MM-DDTHH:mm") has no
 * timezone of its own, so the browser's `Date` parser treats it as local
 * time — exactly what the picker showed the user. Converting to an ISO
 * instant here, before the value leaves the client, is what stops the
 * server (and Postgres, whose session timezone is UTC) from re-interpreting
 * those same digits as UTC and silently shifting the deadline by the
 * viewer's UTC offset. */
export function fromDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
