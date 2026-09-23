import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSessionRevoked } from '../src/lib/auth/session-revocation';

// Regression: logout / password reset / deactivation used to leave old
// session cookies valid for 14 days.

test('never-revoked accounts keep their sessions', () => {
  assert.equal(isSessionRevoked(1_700_000_000, null), false);
  assert.equal(isSessionRevoked(1_700_000_000, undefined), false);
});

test('a cookie minted before the revocation is rejected', () => {
  const revokedAt = new Date(1_700_000_100 * 1000).toISOString();
  assert.equal(isSessionRevoked(1_700_000_099, revokedAt), true);
});

test('a cookie minted in the revocation second (fresh re-login) stays valid', () => {
  const revokedAt = new Date(1_700_000_100 * 1000).toISOString();
  assert.equal(isSessionRevoked(1_700_000_100, revokedAt), false);
  assert.equal(isSessionRevoked(1_700_000_101, revokedAt), false);
});

test('a Postgres-formatted timestamptz string parses', () => {
  assert.equal(isSessionRevoked(1_700_000_099, '2023-11-14 22:15:00+00'), true);
});

test('garbage in the column never locks anyone out', () => {
  assert.equal(isSessionRevoked(1_700_000_000, 'not a date'), false);
});
