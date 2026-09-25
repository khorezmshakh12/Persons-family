import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUzLocale, makeUzDateFormatter, uzRelative } from '../src/lib/intl-uz';

// Node ships full ICU, so its own `uz` output is the reference the browser
// fallback must reproduce exactly (otherwise server HTML and client render
// disagree).
const shapes: Intl.DateTimeFormatOptions[] = [
  { month: 'long' },
  { month: 'short' },
  { month: 'long', year: 'numeric' },
  { month: 'short', year: 'numeric' },
  { day: 'numeric', month: 'long' },
  { day: 'numeric', month: 'short' },
  { day: 'numeric', month: 'short', year: 'numeric' },
  { day: 'numeric', month: 'long', year: 'numeric' },
  { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  { weekday: 'long', day: 'numeric', month: 'long' },
  { weekday: 'short' },
  { weekday: 'narrow' },
  { dateStyle: 'medium' },
  { dateStyle: 'medium', timeStyle: 'short' },
  { dateStyle: 'long' },
  { dateStyle: 'short' },
  { hour: '2-digit', minute: '2-digit' },
  { day: '2-digit', month: '2-digit', year: 'numeric' },
];
const dates = ['2026-09-30T11:44:00Z', '2026-01-04T19:05:09Z', '2026-12-31T20:30:00Z', '2027-05-17T00:00:00Z'];

test('uz date fallback matches Node ICU for the shapes the app uses', () => {
  for (const shape of shapes) {
    for (const iso of dates) {
      const opts = { ...shape, timeZone: 'Asia/Tashkent' };
      const want = new Intl.DateTimeFormat('uz', opts).format(new Date(iso));
      const got = makeUzDateFormatter(Intl.DateTimeFormat, opts).format(new Date(iso));
      assert.equal(got, want, `${JSON.stringify(shape)} @ ${iso}`);
    }
  }
});

test('uz relative time matches Node ICU', () => {
  for (const u of ['second', 'minute', 'hour', 'day', 'week', 'month', 'year'] as const) {
    for (const v of [-3, -1, 0, 1, 3]) {
      assert.equal(uzRelative(v, u), new Intl.RelativeTimeFormat('uz').format(v, u), `${v} ${u}`);
      assert.equal(uzRelative(v, u, 'auto'), new Intl.RelativeTimeFormat('uz', { numeric: 'auto' }).format(v, u), `auto ${v} ${u}`);
    }
  }
});

test('locale detection', () => {
  assert.ok(isUzLocale('uz'));
  assert.ok(isUzLocale(['uz-Latn-UZ']));
  assert.ok(!isUzLocale('ru'));
  assert.ok(!isUzLocale(undefined));
});
