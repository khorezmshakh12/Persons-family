/**
 * HR oversight (owner, 2026-11-23): HR sees every employee's task % and
 * tasks, comments on them and on checklists, and adds / deducts stars —
 * never on themselves or CEO/COO (enforced in the actions via hrCanViewProfile).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canFor, isCeoOnlyAccessKey, SECTION_FUNCTIONS } from '../src/lib/permissions';

const as = (role: string, section_overrides: Record<string, boolean> = {}) => ({ role, section_overrides });

test('HR defaults: task monitor, checklist monitor + feedback, HR stars — not the unlimited CEO grant', () => {
  const hr = as('hr_manager');
  for (const cap of ['tasks.monitor', 'checklist.monitor', 'checklist.feedback', 'stars.hrGrant'] as const) assert.equal(canFor(hr, cap), true, cap);
  assert.equal(canFor(hr, 'stars.grant'), false);
  assert.equal(canFor(as('teacher'), 'tasks.monitor'), false);
  assert.equal(canFor(as('teacher'), 'stars.hrGrant'), false);
  assert.equal(canFor(as('ceo'), 'tasks.monitor'), true);
});

test('both HR functions are switchable in Section access; stars only by the CEO', () => {
  const keys = SECTION_FUNCTIONS.hr?.map((f) => f.key) ?? [];
  assert.ok(keys.includes('tasks.monitor') && keys.includes('stars.hrGrant'));
  assert.equal(isCeoOnlyAccessKey('stars.hrGrant'), true);
  assert.equal(canFor(as('hr_manager', { 'stars.hrGrant': false }), 'stars.hrGrant'), false);
});

test('HR paths re-check the target on the server (no self, no CEO/COO)', () => {
  const stars = readFileSync('src/lib/actions/stars.ts', 'utf8');
  assert.match(stars, /hr && \(userId === actorId \|\| !\(await hrCanViewProfile\(hr, userId\)\)\)/);
  const comments = readFileSync('src/lib/actions/task-comments.ts', 'utf8');
  assert.match(comments, /canFor\(profile, 'tasks\.monitor'\) && \(await hrCanViewProfile\(profile, task\.assigned_to\)\)/);
});
