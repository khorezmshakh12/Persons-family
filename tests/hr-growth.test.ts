/**
 * HR › Roadmap: stages pass strictly in order (employee marks done → CEO
 * approves → next opens) and a stage is complete only when every topic and
 * nested sub-item is done or skipped. Pure — no DB.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_MIND, canon, growthUnsent, mapNode, stageCanon, stageComplete, stagePhases, type GrowthRoadmap } from '../src/lib/hr-growth';

const rm: GrowthRoadmap = {
  name: 'Yo‘l',
  subtitle: '',
  sections: [
    { id: 's1', t: 'A', q: '', left: [{ id: 't1', t: 'x', ch: [{ id: 'u1', t: 'y', ch: [{ id: 'v1', t: 'z', ch: [] }] }] }], right: [] },
    { id: 's2', t: 'B', q: '', left: [{ id: 't2', t: 'x', ch: [] }], right: [] },
    { id: 's3', t: 'C', q: '', left: [], right: [] },
  ],
};

test('only the first not-approved stage is open', () => {
  assert.deepEqual(stagePhases(rm, {}), { s1: 'current', s2: 'locked', s3: 'locked' });
  assert.deepEqual(stagePhases(rm, { s1: { s: 'self_done', at: '' } }), { s1: 'waiting', s2: 'locked', s3: 'locked' });
  assert.deepEqual(stagePhases(rm, { s1: { s: 'approved', at: '', by: 'c' } }), { s1: 'approved', s2: 'current', s3: 'locked' });
  // A later approval never skips an open stage.
  assert.deepEqual(stagePhases(rm, { s2: { s: 'approved', at: '', by: 'c' } }), { s1: 'current', s2: 'locked', s3: 'locked' });
  // Returned by the CEO → open again.
  assert.equal(stagePhases(rm, { s1: { s: 'returned', at: '', by: 'c', note: 'n' } }).s1, 'current');
});

test('stage complete needs every nested item done or skipped', () => {
  const s1 = rm.sections[0];
  assert.equal(stageComplete(s1, { t1: 'done', u1: 'done' }), false);
  assert.equal(stageComplete(s1, { t1: 'done', u1: 'done', v1: 'skip' }), true);
  assert.equal(stageComplete(rm.sections[2], {}), true);
});

test('mapNode edits and deletes at any depth', () => {
  const left = mapNode(rm.sections[0].left, 'v1', (n) => ({ ...n, t: 'new' }));
  assert.equal(left[0].ch[0].ch[0].t, 'new');
  assert.equal(mapNode(rm.sections[0].left, 'u1', () => null)[0].ch.length, 0);
});

test('draft vs sent copy: key order does not matter, content does', () => {
  // jsonb returns keys in its own order.
  const fromDb = JSON.parse(JSON.stringify(rm).replace(/"id":"s1","t":"A"/, '"t":"A","id":"s1"')) as GrowthRoadmap;
  assert.equal(canon(fromDb), canon(rm));
  assert.equal(growthUnsent({ roadmap: rm, mind: EMPTY_MIND, sentRoadmap: fromDb, sentMind: EMPTY_MIND }), false);
  const edited = { ...rm, sections: [{ ...rm.sections[0], t: 'A2' }, ...rm.sections.slice(1)] };
  assert.equal(growthUnsent({ roadmap: edited, mind: EMPTY_MIND, sentRoadmap: rm, sentMind: EMPTY_MIND }), true);
  assert.notEqual(stageCanon(edited.sections[0]), stageCanon(rm.sections[0]));
  assert.equal(stageCanon(edited.sections[1]), stageCanon(rm.sections[1]));
  // A new mind map branch is an unsent change too.
  assert.equal(growthUnsent({ roadmap: rm, mind: { t: '', ch: [{ id: 'm1', t: 'x', ch: [] }] }, sentRoadmap: rm, sentMind: EMPTY_MIND }), true);
});
