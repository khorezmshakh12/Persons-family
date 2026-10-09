/**
 * Team life — pure parts: calendar layers, recurring-event expansion and the
 * iCalendar (.ics) feed. Tested in tests/team-life.test.ts.
 * Day keys are Tashkent 'YYYY-MM-DD'.
 */

export const LAYERS = ['company', 'task', 'milestone', 'leave', 'birthday', 'anniversary', 'deadline', 'oneOnOne', 'lesson'] as const;
export type Layer = (typeof LAYERS)[number];

export const LAYER_META: Record<Layer, { n: string; c: string }> = {
  company: { n: 'Tadbirlar', c: 'var(--au-accent)' },
  task: { n: 'Vazifa muddatlari', c: '#e5484d' },
  milestone: { n: 'Strategiya', c: '#7c5cff' },
  leave: { n: 'Ta’tillar', c: '#0fa3b1' },
  birthday: { n: 'Tug‘ilgan kunlar', c: '#e1306c' },
  anniversary: { n: 'Ish yilliklari', c: '#ff9f1c' },
  deadline: { n: 'Hisobot muddatlari', c: '#8d99ae' },
  oneOnOne: { n: '1:1 uchrashuvlar', c: '#229ed9' },
  lesson: { n: 'Darslar', c: '#34a853' },
};

export type CalEvent = {
  id: string;
  layer: Layer;
  title: string;
  /** First day (Tashkent day key). */
  day: string;
  /** Last day, inclusive (multi-day items such as leave). */
  endDay?: string;
  /** 'HH:MM' Tashkent, when timed. */
  time?: string;
  href?: string;
  meta?: string;
  /** Company events: the viewer's RSVP and the head-count. */
  rsvp?: { mine: 'yes' | 'no' | 'maybe' | null; yes: number; no: number; maybe: number };
  eventId?: string;
  editable?: boolean;
  /** Company events: the stored fields, for editing. */
  raw?: { description: string; location: string; kind: EventKind; repeat: Repeat };
};

export const EVENT_KINDS = ['company', 'meeting', 'training', 'holiday', 'other'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  company: 'Kompaniya tadbiri',
  meeting: 'Yig‘ilish',
  training: 'Trening',
  holiday: 'Bayram / dam olish',
  other: 'Boshqa',
};

export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';

function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function addMonths(key: string, n: number) {
  const [y, m, d] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  const ny = Math.floor(t / 12);
  const nm = (t % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** Occurrence start days of a (possibly repeating) event inside [from, to]. */
export function occurrences(start: string, repeat: Repeat, until: string | null, from: string, to: string, cap = 400): string[] {
  const out: string[] = [];
  const stop = until && until < to ? until : to;
  if (repeat === 'none') return start >= from && start <= to ? [start] : [];
  let k = start;
  for (let i = 0; i < cap && k <= stop; i++) {
    if (k >= from) out.push(k);
    k = repeat === 'weekly' ? addDays(start, 7 * (i + 1)) : repeat === 'monthly' ? addMonths(start, i + 1) : addMonths(start, 12 * (i + 1));
  }
  return out;
}

/** This year's (and next year's) day for a yearly date like a birthday. */
export function yearlyIn(dateKey: string, from: string, to: string): string[] {
  const md = dateKey.slice(5);
  const out: string[] = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    // 29 Feb → 28 Feb on common years.
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    const k = `${y}-${md === '02-29' && !leap ? '02-28' : md}`;
    if (k >= from && k <= to) out.push(k);
  }
  return out;
}

export function sortEvents(list: CalEvent[]): CalEvent[] {
  const order = Object.fromEntries(LAYERS.map((l, i) => [l, i]));
  return [...list].sort((a, b) => (a.day === b.day ? (a.time ?? '99').localeCompare(b.time ?? '99') || order[a.layer] - order[b.layer] : a.day < b.day ? -1 : 1));
}

/* ------------------------------------------------------------ iCalendar */

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** RFC 5545 lines folded at 75 octets (approximated by characters). */
function fold(line: string): string {
  const out: string[] = [];
  let s = line;
  while (s.length > 74) {
    out.push(s.slice(0, 74));
    s = ` ${s.slice(74)}`;
  }
  out.push(s);
  return out.join('\r\n');
}

/** A personal calendar feed. Timed events carry TZID=Asia/Tashkent. */
export function toIcs(events: CalEvent[], stamp: string, name = 'Persons'): string {
  const dt = (k: string) => k.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Persons Education//Staff//UZ',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${esc(name)}`,
    'X-WR-TIMEZONE:Asia/Tashkent',
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@persons-staffs.uz`, `DTSTAMP:${stamp}`);
    if (e.time) {
      lines.push(`DTSTART;TZID=Asia/Tashkent:${dt(e.day)}T${e.time.replace(':', '')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dt(e.day)}`, `DTEND;VALUE=DATE:${dt(addDays(e.endDay ?? e.day, 1))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.meta) lines.push(`DESCRIPTION:${esc(e.meta)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export const NEWS_CATEGORIES = ['general', 'dept', 'holiday', 'order', 'achievement'] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];
export const NEWS_CATEGORY_LABEL: Record<NewsCategory, string> = {
  general: 'Umumiy',
  dept: 'Bo‘lim',
  holiday: 'Bayram',
  order: 'Buyruq',
  achievement: 'Yutuq',
};

export const NEWS_TEMPLATES: { n: string; title: string; content: string; category: NewsCategory; mustAck: boolean }[] = [
  { n: 'Buyruq', title: 'Buyruq: ', content: 'Hurmatli jamoa,\n\n…\n\nBuyruq e’lon qilingan kundan kuchga kiradi.', category: 'order', mustAck: true },
  { n: 'Bayram tabrigi', title: 'Bayramingiz muborak!', content: 'Aziz hamkasblar,\n\n…\n\nHurmat bilan, rahbariyat', category: 'holiday', mustAck: false },
  { n: 'Yutuq', title: 'Tabriklaymiz: ', content: '…', category: 'achievement', mustAck: false },
  { n: 'Yig‘ilish', title: 'Umumiy yig‘ilish', content: 'Sana: …\nVaqt: …\nJoy: …\nKun tartibi:\n1. …', category: 'general', mustAck: true },
];
