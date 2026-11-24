// Month names for the UI language. Server libraries still build labels with
// Uzbek month names (Yanvar, Noy …); localizeMonths() swaps those words for the
// viewer's language, so charts and lists read right in en / ru too.

const UZ_FULL = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const UZ_SHORT = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const UZ_SHORT_ALT: Record<string, number> = { Iyun: 5, Iyul: 6 };

const cache = new Map<string, { full: string[]; short: string[] }>();
function names(locale: string) {
  let n = cache.get(locale);
  if (!n) {
    const fmt = (month: 'long' | 'short') => {
      const f = new Intl.DateTimeFormat(locale, { month, timeZone: 'UTC' });
      return Array.from({ length: 12 }, (_, i) => {
        const s = f.format(new Date(Date.UTC(2026, i, 15)));
        return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, '');
      });
    };
    n = { full: fmt('long'), short: fmt('short') };
    cache.set(locale, n);
  }
  return n;
}

/** Month name in the UI language (m = 1..12). */
export function monthName(locale: string, m: number, short = false): string {
  if (locale === 'uz') return (short ? UZ_SHORT : UZ_FULL)[m - 1];
  const n = names(locale);
  return (short ? n.short : n.full)[m - 1];
}

const FULL_RE = new RegExp(`\\b(${UZ_FULL.join('|')})\\b`, 'g');
const SHORT_RE = new RegExp(`\\b(${UZ_SHORT.join('|')})\\b`, 'g');

/** Replace Uzbek month words in a label with the locale's (no-op for uz). */
export function localizeMonths(text: string, locale: string): string {
  if (locale === 'uz' || !text) return text;
  const n = names(locale);
  let out = text.replace(FULL_RE, (w) => {
    const i = UZ_FULL.indexOf(w);
    return i >= 0 ? n.full[i] : w;
  });
  out = out.replace(SHORT_RE, (w) => {
    const i = UZ_SHORT.indexOf(w);
    return i >= 0 ? n.short[i] : w;
  });
  for (const [w, i] of Object.entries(UZ_SHORT_ALT)) out = out.replace(new RegExp(`\\b${w}\\b`, 'g'), n.short[i]);
  return out;
}

/** «Noyabr 2026» / «November 2026» for a 'YYYY-MM' or 'YYYY-MM-DD' key, in the UI language. */
export function monthYear(locale: string, period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${monthName(locale, m)} ${y}`;
}
