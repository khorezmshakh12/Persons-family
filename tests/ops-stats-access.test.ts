/**
 * Operation HQ › Statistika access (owner, 2026-11-19): student and lead
 * figures for Operation HQ staff, money figures CEO only, both switchable in
 * Section access.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canFor, isCeoOnlyAccessKey, SECTION_FUNCTIONS } from '../src/lib/permissions';

const as = (role: string, section_overrides: Record<string, boolean> = {}) => ({ role, section_overrides });

test('defaults: CEO sees both, Office Manager and COO students only, Sales manager neither', () => {
  assert.equal(canFor(as('ceo'), 'operations.statsMoney'), true);
  assert.equal(canFor(as('ceo'), 'operations.stats'), true);
  for (const r of ['office_manager', 'coo', 'admin_manager']) {
    assert.equal(canFor(as(r), 'operations.stats'), true, r);
    assert.equal(canFor(as(r), 'operations.statsMoney'), false, r);
  }
  assert.equal(canFor(as('sales_manager'), 'operations.stats'), false);
  assert.equal(canFor(as('sales_manager'), 'operations.statsMoney'), false);
});

test('Section access lists both functions; money is CEO-only to switch', () => {
  assert.deepEqual(SECTION_FUNCTIONS.operations?.map((f) => f.key), ['operations.stats', 'operations.statsMoney']);
  assert.equal(isCeoOnlyAccessKey('operations.statsMoney'), true);
  assert.equal(isCeoOnlyAccessKey('operations.stats'), false);
  // A person-level override opens money figures for one COO.
  assert.equal(canFor(as('coo', { 'operations.statsMoney': true }), 'operations.statsMoney'), true);
});
