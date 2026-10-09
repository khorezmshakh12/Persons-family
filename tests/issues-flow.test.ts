import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deadlines,
  fmtSpan,
  priorityFromUrgency,
  reporterLabel,
  similarIssues,
  slaOf,
  STAGE_MOVES,
  stageOf,
} from '../src/lib/issues-flow';
import { toPlain } from '../src/lib/notify-text';

const base = { status: 'open', accepted_at: null, closed_at: null };

test('stage is derived from status + acceptance + closure', () => {
  assert.equal(stageOf(base), 'new');
  assert.equal(stageOf({ ...base, accepted_at: '2026-10-10T05:00:00Z' }), 'accepted');
  assert.equal(stageOf({ ...base, status: 'in_progress' }), 'in_progress');
  assert.equal(stageOf({ ...base, status: 'done' }), 'resolved');
  assert.equal(stageOf({ ...base, status: 'done', closed_at: '2026-10-10T05:00:00Z' }), 'closed');
});

test('a resolved issue can only go back to work; closing is the reporter’s', () => {
  assert.deepEqual(STAGE_MOVES.resolved, ['in_progress']);
  assert.ok(!STAGE_MOVES.resolved.includes('closed'));
  assert.ok(STAGE_MOVES.new.includes('accepted'));
});

test('deadlines follow priority; ideas get no resolve deadline', () => {
  const t0 = Date.parse('2026-10-10T00:00:00Z');
  const u = deadlines('urgent', 'problem', t0);
  assert.equal(u.respondBy, '2026-10-10T02:00:00.000Z');
  assert.equal(u.resolveBy, '2026-10-11T00:00:00.000Z');
  assert.equal(deadlines('normal', 'idea', t0).resolveBy, null);
});

test('SLA: response while new, resolution while worked, none once resolved', () => {
  const i = {
    ...base,
    created_at: '2026-10-10T00:00:00Z',
    respond_by: '2026-10-10T04:00:00Z',
    resolve_by: '2026-10-13T00:00:00Z',
  };
  const s1 = slaOf(i, Date.parse('2026-10-10T05:00:00Z'));
  assert.equal(s1?.what, 'respond');
  assert.equal(s1?.breached, true);
  const s2 = slaOf({ ...i, accepted_at: '2026-10-10T01:00:00Z' }, Date.parse('2026-10-10T05:00:00Z'));
  assert.equal(s2?.what, 'resolve');
  assert.equal(s2?.breached, false);
  assert.equal(slaOf({ ...i, status: 'done' }, Date.parse('2026-10-20T00:00:00Z')), null);
});

test('time spans read naturally', () => {
  assert.equal(fmtSpan(40 * 60_000), '40 daq');
  assert.equal(fmtSpan(-(2 * 3_600_000 + 15 * 60_000)), '2 soat 15 daq');
  assert.equal(fmtSpan(3 * 86_400_000 + 4 * 3_600_000), '3 kun 4 soat');
});

test('Jev urgency maps to a priority', () => {
  assert.equal(priorityFromUrgency(null), null);
  assert.equal(priorityFromUrgency(2.8), 'urgent');
  assert.equal(priorityFromUrgency(1.6), 'high');
  assert.equal(priorityFromUrgency(0.4), 'normal');
});

test('recurring issues are grouped by wording within 30 days', () => {
  const mk = (id: string, title: string, day: number, category: string | null = null) => ({
    id,
    title,
    description: null,
    category,
    created_at: new Date(Date.parse('2026-10-01T00:00:00Z') + day * 86_400_000).toISOString(),
  });
  const target = mk('a', '204-xonada proyektor yonmayapti', 20, 'texnik_jihoz');
  const all = [
    target,
    mk('b', 'Proyektor 204 xonada yana yonmayapti', 10, 'texnik_jihoz'),
    mk('c', 'Ish haqi kechikdi', 12, 'moliya'),
    mk('d', '204-xonada proyektor yonmayapti', -40, 'texnik_jihoz'),
  ];
  assert.deepEqual(similarIssues(target, all).map((x) => x.id), ['b']);
});

test('anonymous ideas hide the reporter from everyone else', () => {
  assert.equal(reporterLabel(true, false, 'Ali Valiyev'), 'Anonim');
  assert.equal(reporterLabel(true, true, 'Ali Valiyev'), 'Ali Valiyev');
  assert.equal(reporterLabel(false, false, 'Ali Valiyev'), 'Ali Valiyev');
});

test('Telegram HTML becomes a plain bell title and body', () => {
  assert.deepEqual(toPlain('✅ <b>Murojaatingiz hal qilindi</b>\n«A &amp; B»\nIltimos, tasdiqlang'), {
    title: '✅ Murojaatingiz hal qilindi',
    body: '«A & B» · Iltimos, tasdiqlang',
  });
  assert.deepEqual(toPlain('  '), { title: 'Bildirishnoma', body: null });
});
