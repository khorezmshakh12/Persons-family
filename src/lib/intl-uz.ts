// Uzbek (uz) Intl fallback for browsers whose ICU ships no Uzbek data.
//
// Chrome's bundled ICU has no `uz` date/relative-time/number data, so
// `new Intl.DateTimeFormat('uz', { month: 'long' })` prints "M09", weekdays
// come out in English ("Fri"), relative time as "-5 min" and numbers as
// "1,234,567.5" — while the server (Node, full ICU) renders the proper
// "30-sentabr", "5 daqiqa oldin", "1 234 567,5". Every client-rendered date
// on the uz site was therefore wrong and mismatched its server HTML.
//
// These formatters reproduce Node's CLDR uz output exactly for the option
// shapes the app uses (tests/intl-uz.test.ts compares them against Node).
// installUzIntl() patches the Intl constructors + Date/Number toLocale*
// ONLY for uz locales and ONLY when the runtime lacks uz data; every other
// locale goes straight to the native implementation.

const MONTH_LONG = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const MONTH_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];
const WD_LONG = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
const WD_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
const WD_NARROW = ['Y', 'D', 'S', 'C', 'P', 'J', 'S'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pad = (n: number | string) => String(n).padStart(2, '0');

type DTFOptions = Intl.DateTimeFormatOptions;
type NativeDTF = typeof Intl.DateTimeFormat;

export function isUzLocale(locales: unknown): boolean {
  const l = Array.isArray(locales) ? locales[0] : locales;
  return typeof l === 'string' && /^uz(?:$|[-_])/i.test(l);
}

function expand(opts: DTFOptions = {}, defaults: 'date' | 'time' | 'all' = 'date'): DTFOptions {
  const { dateStyle, timeStyle, ...rest } = opts;
  const o: DTFOptions = { ...rest };
  if (dateStyle === 'full') Object.assign(o, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  else if (dateStyle === 'long') Object.assign(o, { day: 'numeric', month: 'long', year: 'numeric' });
  else if (dateStyle === 'medium') Object.assign(o, { day: 'numeric', month: 'short', year: 'numeric' });
  else if (dateStyle === 'short') Object.assign(o, { day: '2-digit', month: '2-digit', year: '2-digit' });
  if (timeStyle) Object.assign(o, timeStyle === 'short' ? { hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const any = o.weekday || o.era || o.year || o.month || o.day || o.hour || o.minute || o.second;
  if (!any) {
    if (defaults !== 'time') Object.assign(o, { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (defaults !== 'date') Object.assign(o, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return o;
}

export function makeUzDateFormatter(Native: NativeDTF, opts: DTFOptions = {}, defaults: 'date' | 'time' | 'all' = 'date') {
  const o = expand(opts, defaults);
  const tz = o.timeZone;
  const partsFmt = new Native('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const numericDate = o.day || o.month || o.year ? new Native('en-GB', { timeZone: tz, day: o.day, month: o.month, year: o.year }) : null;

  const format = (input?: Date | number | string) => {
    const d = input === undefined ? new Date() : input instanceof Date ? input : new Date(input);
    const p: Record<string, string> = {};
    for (const x of partsFmt.formatToParts(d)) p[x.type] = x.value;
    const Y = o.year === '2-digit' ? p.year.slice(-2) : p.year;
    const M = Number(p.month) - 1;
    const D = o.day === '2-digit' ? pad(p.day) : String(Number(p.day));
    const W = WD_EN.indexOf(p.weekday);

    let date = '';
    const textMonth = o.month === 'long' || o.month === 'short' || o.month === 'narrow';
    if (textMonth) {
      const mn = o.month === 'long' ? MONTH_LONG[M] : MONTH_SHORT[M];
      if (o.day) date = `${D}-${mn}${o.year ? `, ${Y}` : ''}`;
      else if (o.year) date = `${mn}, ${Y}`;
      else date = cap(mn);
    } else if (numericDate) {
      date = numericDate.format(d);
    }
    if (o.weekday) {
      const w = o.weekday === 'long' ? WD_LONG[W] : o.weekday === 'short' ? WD_SHORT[W] : WD_NARROW[W];
      date = date ? `${w}, ${date}` : cap(w);
    }
    let time = '';
    if (o.hour || o.minute || o.second) {
      const hh = p.hour === '24' ? '00' : p.hour;
      const bits = [o.hour ? (o.hour === 'numeric' && !o.minute ? String(Number(hh)) : hh) : null, o.minute ? p.minute : null, o.second ? p.second : null].filter(
        (x): x is string => x !== null,
      );
      time = bits.join(':');
    }
    return [date, time].filter(Boolean).join(', ');
  };
  return { format, resolvedOptions: () => ({ ...partsFmt.resolvedOptions(), ...o, locale: 'uz' }) };
}

const REL_WORD: Record<string, string> = {
  second: 'soniya',
  minute: 'daqiqa',
  hour: 'soat',
  day: 'kun',
  week: 'hafta',
  month: 'oy',
  quarter: 'chorak',
  year: 'yil',
};
const REL_AUTO: Record<string, [string, string, string]> = {
  second: ['1 soniya oldin', 'hozir', '1 soniyadan keyin'],
  minute: ['1 daqiqa oldin', 'shu daqiqada', '1 daqiqadan keyin'],
  hour: ['1 soat oldin', 'shu soatda', '1 soatdan keyin'],
  day: ['kecha', 'bugun', 'ertaga'],
  week: ['o‘tgan hafta', 'shu hafta', 'keyingi hafta'],
  month: ['o‘tgan oy', 'shu oy', 'keyingi oy'],
  quarter: ['o‘tgan chorak', 'shu chorak', 'keyingi chorak'],
  year: ['o‘tgan yil', 'shu yil', 'keyingi yil'],
};

export function uzRelative(value: number, unitIn: string, numeric: 'always' | 'auto' = 'always') {
  const unit = unitIn.replace(/s$/, '');
  if (numeric === 'auto' && REL_AUTO[unit] && (value === -1 || value === 0 || value === 1) && !Object.is(value, -0)) {
    return REL_AUTO[unit][value + 1];
  }
  const n = Math.abs(value);
  const w = REL_WORD[unit] ?? unit;
  return value < 0 || Object.is(value, -0) ? `${n} ${w} oldin` : `${n} ${w}dan keyin`;
}

let installed = false;

/** Browser-only. No-op unless the runtime prints "M09"-style uz months. */
export function installUzIntl() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  let broken = false;
  try {
    broken = /^M\d/.test(new Intl.DateTimeFormat('uz', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 8, 1))));
  } catch {
    broken = false;
  }
  if (!broken) return;

  const NativeDTF = Intl.DateTimeFormat;
  const NativeRTF = Intl.RelativeTimeFormat;
  const NativeNF = Intl.NumberFormat;

  const uzDTF = (opts?: DTFOptions, defaults: 'date' | 'time' | 'all' = 'date') => {
    const f = makeUzDateFormatter(NativeDTF, opts, defaults);
    const safe = (d?: Date | number) => {
      try {
        return f.format(d);
      } catch {
        return new NativeDTF('ru', opts).format(d);
      }
    };
    return {
      format: safe,
      formatToParts: (d?: Date | number) => [{ type: 'literal' as const, value: safe(d) }],
      formatRange: (a: Date | number, b: Date | number) => `${safe(a)} – ${safe(b)}`,
      resolvedOptions: f.resolvedOptions,
    };
  };

  const PatchedDTF = function (this: unknown, locales?: string | string[], options?: DTFOptions) {
    return isUzLocale(locales) ? uzDTF(options) : new NativeDTF(locales, options);
  } as unknown as NativeDTF;
  ((PatchedDTF as unknown) as { prototype: unknown }).prototype = NativeDTF.prototype;
  PatchedDTF.supportedLocalesOf = NativeDTF.supportedLocalesOf.bind(NativeDTF);

  const PatchedRTF = function (this: unknown, locales?: string | string[], options?: Intl.RelativeTimeFormatOptions) {
    if (!isUzLocale(locales)) return new NativeRTF(locales, options);
    const numeric = options?.numeric === 'auto' ? 'auto' : 'always';
    return {
      format: (v: number, u: Intl.RelativeTimeFormatUnit) => uzRelative(v, u, numeric),
      formatToParts: (v: number, u: Intl.RelativeTimeFormatUnit) => [{ type: 'literal' as const, value: uzRelative(v, u, numeric) }],
      resolvedOptions: () => ({ ...new NativeRTF('en', options).resolvedOptions(), locale: 'uz' }),
    };
  } as unknown as typeof Intl.RelativeTimeFormat;
  ((PatchedRTF as unknown) as { prototype: unknown }).prototype = NativeRTF.prototype;
  PatchedRTF.supportedLocalesOf = NativeRTF.supportedLocalesOf.bind(NativeRTF);

  // uz grouping/decimal marks match ru ("1 234 567,5"); percent matches en.
  const nfLocale = (options?: Intl.NumberFormatOptions) => (options?.style === 'percent' ? 'en-US' : 'ru');
  const PatchedNF = function (this: unknown, locales?: string | string[], options?: Intl.NumberFormatOptions) {
    return new NativeNF(isUzLocale(locales) ? nfLocale(options) : locales, options);
  } as unknown as typeof Intl.NumberFormat;
  ((PatchedNF as unknown) as { prototype: unknown }).prototype = NativeNF.prototype;
  PatchedNF.supportedLocalesOf = NativeNF.supportedLocalesOf.bind(NativeNF);

  const I = Intl as unknown as Record<string, unknown>;
  I.DateTimeFormat = PatchedDTF;
  I.RelativeTimeFormat = PatchedRTF;
  I.NumberFormat = PatchedNF;

  const dToDate = Date.prototype.toLocaleDateString;
  const dToTime = Date.prototype.toLocaleTimeString;
  const dToAll = Date.prototype.toLocaleString;
  Date.prototype.toLocaleDateString = function (l?: string | string[], o?: DTFOptions) {
    return isUzLocale(l) ? uzDTF(o, 'date').format(this) : dToDate.call(this, l, o);
  };
  Date.prototype.toLocaleTimeString = function (l?: string | string[], o?: DTFOptions) {
    return isUzLocale(l) ? uzDTF(o, 'time').format(this) : dToTime.call(this, l, o);
  };
  Date.prototype.toLocaleString = function (l?: string | string[], o?: DTFOptions) {
    return isUzLocale(l) ? uzDTF(o, 'all').format(this) : dToAll.call(this, l, o);
  };
  const nToLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l?: string | string[], o?: Intl.NumberFormatOptions) {
    return nToLocale.call(this, isUzLocale(l) ? nfLocale(o) : l, o);
  };
}
