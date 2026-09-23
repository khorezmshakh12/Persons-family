import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToKey,
  startOfPreviousTashkentMonthKey,
  tashkentDayKey,
  tashkentMidnight,
  tashkentMonthKey,
} from '../src/lib/time';

// Business time is Asia/Tashkent (UTC+5); the server clock is UTC.

test('late UTC evening is already the next Tashkent day', () => {
  assert.equal(tashkentDayKey(new Date('2026-08-31T20:00:00Z')), '2026-09-01');
  assert.equal(tashkentMonthKey(new Date('2026-08-31T20:00:00Z')), '2026-09');
});

test('Tashkent midnight is 19:00 UTC the day before', () => {
  assert.equal(tashkentMidnight('2026-09-01').toISOString(), '2026-08-31T19:00:00.000Z');
});

test('previous month wraps the year', () => {
  assert.equal(startOfPreviousTashkentMonthKey(new Date('2026-01-15T12:00:00Z')), '2025-12-01');
});

test('day arithmetic crosses month ends', () => {
  assert.equal(addDaysToKey('2026-02-28', 1), '2026-03-01');
});
