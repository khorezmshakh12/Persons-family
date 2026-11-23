/**
 * Operation HQ › O'quvchilar v3 (owner, 2026-11-23).
 * - Every crm_student_log kind the code writes must be allowed by the
 *   latest crm_student_log_kind_check — 'chargecancel' was missing, so
 *   «Yechimni bekor qilish» failed with «Saqlab bo'lmadi» in production.
 * - Statistika chart buckets: 31 days / 12 weeks / 12 months ending today.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { trendBuckets } from '../src/lib/ops-trend-buckets';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

test('every crm_student_log kind written by the code is in the DB check constraint', () => {
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  let allowed: string[] | null = null;
  for (const m of migrations) {
    const sql = readFileSync(join('supabase/migrations', m), 'utf8');
    const hit = /crm_student_log_kind_check\s+check \(kind in \(([^)]*)\)\)/.exec(sql);
    if (hit) allowed = [...hit[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  assert.ok(allowed, 'constraint found');
  const used = new Set<string>();
  for (const f of files('src')) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/insert into crm_student_log \(student_id, kind[^)]*\)\s*values \(\$\{[^}]+\}, ('([a-z_]+)'|\$\{[^}]*\?\s*'([a-z_]+)'\s*:\s*'([a-z_]+)'\s*\})/g)) {
      for (const k of [m[2], m[3], m[4]]) if (k) used.add(k);
    }
  }
  assert.ok(used.has('chargecancel') && used.has('shift'), `scan works: ${[...used].join(',')}`);
  for (const k of used) assert.ok(allowed!.includes(k), `kind '${k}' is not allowed by crm_student_log_kind_check`);
});

test('trend buckets: 31 days, Mon–Sun weeks, calendar months, all ending today', () => {
  const day = trendBuckets('2026-11-23', 'day');
  assert.equal(day.length, 31);
  assert.deepEqual(day[0], { from: '2026-10-24', to: '2026-10-24', label: '24.10' });
  assert.equal(day[30].to, '2026-11-23');

  const week = trendBuckets('2026-11-23', 'week'); // a Monday
  assert.equal(week.length, 12);
  assert.deepEqual(week[11], { from: '2026-11-23', to: '2026-11-23', label: '23.11' });
  assert.deepEqual(week[10], { from: '2026-11-16', to: '2026-11-22', label: '16.11' });

  const month = trendBuckets('2026-11-23', 'month');
  assert.equal(month.length, 12);
  assert.deepEqual(month[0], { from: '2025-12-01', to: '2025-12-31', label: 'Dek' });
  assert.deepEqual(month[1], { from: '2026-01-01', to: '2026-01-31', label: 'Yan' });
  assert.deepEqual(month[2], { from: '2026-02-01', to: '2026-02-28', label: 'Fev' });
  assert.deepEqual(month[11], { from: '2026-11-01', to: '2026-11-23', label: 'Noy' });
});

test('trend buckets on a Sunday and in January', () => {
  const week = trendBuckets('2026-11-29', 'week');
  assert.deepEqual(week[11], { from: '2026-11-23', to: '2026-11-29', label: '23.11' });
  const month = trendBuckets('2027-01-05', 'month');
  assert.equal(month[0].from, '2026-02-01');
  assert.equal(month[10].to, '2026-12-31');
});
