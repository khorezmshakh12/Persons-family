import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, HOUR_MS, MINUTE_MS, finishedOnTime, formatCountdown, parseInstant } from '../src/lib/countdown';

// `deadline` is a timestamptz instant; overdue means `deadline < now()`
// (getVisibleTasksAction / task-overdue-penalties) and late means
// `completed_at > deadline` (settleTaskStars).

const DEADLINE = Date.parse('2026-09-24T13:00:00.000Z'); // 18:00 Tashkent

test('days + hh:mm:ss, neutral tone with more than a day left', () => {
  const now = DEADLINE - (2 * DAY_MS + 4 * HOUR_MS + 13 * MINUTE_MS + 9_000);
  assert.deepEqual(formatCountdown(DEADLINE, now), { text: '2k 04:13:09', tone: 'ok', overdue: false });
});

test('under 24h drops the day prefix and turns amber', () => {
  const cd = formatCountdown(DEADLINE, DEADLINE - (23 * HOUR_MS + 59 * MINUTE_MS + 59_000));
  assert.equal(cd.text, '23:59:59');
  assert.equal(cd.tone, 'warn');
  assert.equal(formatCountdown(DEADLINE, DEADLINE - DAY_MS).tone, 'ok');
});

test('remaining time rounds up — never a premature 00:00:00', () => {
  assert.equal(formatCountdown(DEADLINE, DEADLINE - 300).text, '00:00:01');
});

test('exactly at the deadline is not overdue yet (deadline < now)', () => {
  assert.deepEqual(formatCountdown(DEADLINE, DEADLINE), { text: '00:00:00', tone: 'warn', overdue: false });
});

test('one millisecond past the deadline is overdue, red, with a minus sign', () => {
  const cd = formatCountdown(DEADLINE, DEADLINE + 1);
  assert.equal(cd.overdue, true);
  assert.equal(cd.tone, 'bad');
  assert.equal(cd.text, '−00:00:00');
  assert.equal(formatCountdown(DEADLINE, DEADLINE + DAY_MS + 5 * MINUTE_MS + 12_400).text, '−1k 00:05:12');
});

test('done tasks: on time when completed_at <= deadline, late after', () => {
  const d = '2026-09-24T13:00:00.000Z';
  assert.equal(finishedOnTime(d, '2026-09-24T13:00:00.000Z'), true);
  assert.equal(finishedOnTime(d, '2026-09-24T12:59:59.000Z'), true);
  assert.equal(finishedOnTime(d, '2026-09-24T13:00:00.001Z'), false);
  // Postgres-style offset strings parse to the same instant.
  assert.equal(finishedOnTime('2026-09-24 18:00:00+05', '2026-09-24T13:00:01Z'), false);
  assert.equal(finishedOnTime(d, null), null);
});

test('parseInstant reads Postgres wire timestamps as the same instant', () => {
  const iso = Date.parse('2026-09-24T13:00:00.000Z');
  assert.equal(parseInstant('2026-09-24 18:00:00+05'), iso);
  assert.equal(parseInstant('2026-09-24 13:00:00+00'), iso);
  assert.equal(parseInstant('2026-09-24 13:00:00.123456+00'), iso + 123);
  assert.equal(parseInstant('2026-09-24T18:00:00+05:00'), iso);
  assert.equal(parseInstant('2026-09-24T13:00:00Z'), iso);
  assert.ok(Number.isNaN(parseInstant('nonsense')));
  assert.ok(Number.isNaN(parseInstant(null)));
});
