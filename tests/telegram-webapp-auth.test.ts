import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyTelegramInitData } from '../src/lib/telegram-webapp-auth';

const TOKEN = '123456:TEST-token';
const NOW = 1_800_000_000;

function sign(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

const fields = { auth_date: String(NOW - 60), query_id: 'AAE', user: JSON.stringify({ id: 42, first_name: 'Ali' }) };

test('accepts a correctly signed, fresh payload', () => {
  assert.equal(verifyTelegramInitData(sign(fields), TOKEN, NOW)?.id, 42);
});

test('rejects a payload signed with another bot token', () => {
  assert.equal(verifyTelegramInitData(sign(fields, '999:other'), TOKEN, NOW), null);
});

test('rejects a tampered user field', () => {
  const tampered = sign(fields).replace(encodeURIComponent('"id":42'), encodeURIComponent('"id":43'));
  assert.equal(verifyTelegramInitData(tampered, TOKEN, NOW), null);
});

test('rejects a stale payload and a missing hash', () => {
  assert.equal(verifyTelegramInitData(sign({ ...fields, auth_date: String(NOW - 2 * 86400) }), TOKEN, NOW), null);
  assert.equal(verifyTelegramInitData(new URLSearchParams(fields).toString(), TOKEN, NOW), null);
});
