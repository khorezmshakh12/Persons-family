import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, sortEvents, toIcs, yearlyIn, type CalEvent } from '../src/lib/team-life';

test('one-off and weekly occurrences inside the window', () => {
  assert.deepEqual(occurrences('2026-10-10', 'none', null, '2026-10-01', '2026-10-31'), ['2026-10-10']);
  assert.deepEqual(occurrences('2026-09-01', 'none', null, '2026-10-01', '2026-10-31'), []);
  assert.deepEqual(occurrences('2026-09-29', 'weekly', null, '2026-10-01', '2026-10-20'), ['2026-10-06', '2026-10-13', '2026-10-20']);
  assert.deepEqual(occurrences('2026-10-06', 'weekly', '2026-10-14', '2026-10-01', '2026-10-31'), ['2026-10-06', '2026-10-13']);
});

test('a years-old weekly series still shows (no cap cut-off)', () => {
  assert.deepEqual(occurrences('2018-01-01', 'weekly', null, '2026-10-05', '2026-10-18'), ['2026-10-05', '2026-10-12']);
  assert.deepEqual(occurrences('2010-03-15', 'monthly', null, '2026-10-01', '2026-11-30'), ['2026-10-15', '2026-11-15']);
});

test('monthly repeats clamp to the month end; yearly keeps the date', () => {
  assert.deepEqual(occurrences('2026-01-31', 'monthly', null, '2026-02-01', '2026-04-30'), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(occurrences('2025-10-09', 'yearly', null, '2026-01-01', '2026-12-31'), ['2026-10-09']);
});

test('birthdays repeat every year; 29 Feb falls on 28 Feb', () => {
  assert.deepEqual(yearlyIn('1990-10-12', '2026-10-01', '2026-10-31'), ['2026-10-12']);
  assert.deepEqual(yearlyIn('2000-02-29', '2027-02-01', '2027-03-01'), ['2027-02-28']);
  assert.deepEqual(yearlyIn('1990-12-31', '2026-12-20', '2027-01-10'), ['2026-12-31']);
});

test('events sort by day, then time, then layer', () => {
  const e = (id: string, day: string, time?: string, layer: CalEvent['layer'] = 'company'): CalEvent => ({ id, layer, title: id, day, time });
  assert.deepEqual(sortEvents([e('c', '2026-10-02'), e('b', '2026-10-01', '10:00'), e('a', '2026-10-01', '09:00')]).map((x) => x.id), ['a', 'b', 'c']);
});

test('ics feed: all-day end is exclusive, timed events carry the Tashkent zone, text escaped', () => {
  const ics = toIcs(
    [
      { id: 'lv-1', layer: 'leave', title: 'Ali — ta’til', day: '2026-10-10', endDay: '2026-10-12' },
      { id: 'ev-2', layer: 'company', title: 'Yig‘ilish, 1-qavat', day: '2026-10-15', time: '14:30', meta: 'Kun tartibi; reja' },
    ],
    '20261009T120000Z',
  );
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261013'));
  assert.ok(ics.includes('DTSTART;TZID=Asia/Tashkent:20261015T143000'));
  assert.ok(ics.includes('SUMMARY:Yig‘ilish\\, 1-qavat'));
  assert.ok(ics.includes('DESCRIPTION:Kun tartibi\\; reja'));
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
});
