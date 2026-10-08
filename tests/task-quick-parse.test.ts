import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickTask } from '../src/lib/task-quick-parse';

const people = [
  { id: 'a', first_name: 'Alisher', last_name: 'Qodirov' },
  { id: 'm', first_name: 'Malika', last_name: 'Karimova' },
];
// 2026-10-08 10:00 Tashkent = 05:00 UTC
const now = new Date('2026-10-08T05:00:00Z');

test('parses assignee, relative day, time and stars', () => {
  const r = parseQuickTask('Oylik hisobot @ali ertaga 15:00 +10', people, now);
  assert.equal(r.title, 'Oylik hisobot');
  assert.equal(r.assigneeId, 'a');
  assert.equal(r.deadline, '2026-10-09T10:00:00.000Z');
  assert.equal(r.starReward, 10);
});

test('day only defaults to 18:00 Tashkent', () => {
  assert.equal(parseQuickTask('Dars @mal bugun', people, now).deadline, '2026-10-08T13:00:00.000Z');
});

test('explicit date and plain title', () => {
  const r = parseQuickTask('Hisobot 25.10', people, now);
  assert.equal(r.deadline, '2026-10-25T13:00:00.000Z');
  assert.equal(r.assigneeId, null);
  assert.equal(parseQuickTask('Shunchaki matn', people, now).deadline, null);
});

test('unknown @mention stays in the title', () => {
  assert.equal(parseQuickTask('Salom @zz', people, now).title, 'Salom @zz');
});
