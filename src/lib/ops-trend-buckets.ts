// Operation HQ › Statistika grafiklari (owner, 2026-11-23): the time buckets
// every trend line shares — Kunlik = last 31 days, Haftalik = last 12
// Mon–Sun weeks, Oylik = last 12 calendar months, each ending today.
// Pure (day keys in, day keys out) so it is unit-tested without a DB.

export type TrendBucket = { from: string; to: string; label: string };
export type TrendKey = 'day' | 'week' | 'month';

const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

function add(key: string, days: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
const dm = (k: string) => `${k.slice(8, 10)}.${k.slice(5, 7)}`;

/** Monday of the week `key` falls in. */
function monday(key: string): string {
  const dow = new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return add(key, -((dow + 6) % 7));
}

function monthStart(key: string, back: number): string {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) - back;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** Oldest first; the last bucket ends today. */
export function trendBuckets(today: string, kind: TrendKey): TrendBucket[] {
  if (kind === 'day') return Array.from({ length: 31 }, (_, i) => add(today, i - 30)).map((d) => ({ from: d, to: d, label: dm(d) }));
  if (kind === 'week') {
    const mon = monday(today);
    return Array.from({ length: 12 }, (_, i) => {
      const from = add(mon, (i - 11) * 7);
      const end = add(from, 6);
      return { from, to: end < today ? end : today, label: dm(from) };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const from = monthStart(today, 11 - i);
    const to = i === 11 ? today : add(monthStart(today, 10 - i), -1);
    return { from, to, label: MONTHS[Number(from.slice(5, 7)) - 1] };
  });
}
