/**
 * Applies supabase/migrations/20260901000000_stars_market_task_comments_reports.sql
 * to the Cloud SQL "app" database. No migration runner exists in this repo,
 * so — like scripts/backfill-lesson-slots.ts — this is a one-off script that
 * connects with a bare `postgres` client through the Cloud SQL Auth Proxy on
 * 127.0.0.1:5433.
 *
 * The migration file is one transaction (`begin; ... commit;`) and every
 * statement is IF NOT EXISTS / additive, so it is safe to re-run.
 *
 * Usage:
 *   cloud-sql-proxy persons-staff-b01a83bd:europe-west3:persons-staff-db --port 5433 &
 *   npx tsx scripts/apply-upgrade-migration.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(here, '..', 'supabase', 'migrations', '20260901000000_stars_market_task_comments_reports.sql');

// Same proxy connection string scripts/backfill-lesson-slots.ts uses.
// max: 1 so postgres-js allows the file's own `begin; ... commit;` through
// sql.unsafe() (it refuses embedded transaction commands on a pool).
const sql = postgres('postgres://postgres:rnQTe2aILZonLj0NaWkV8XBb@127.0.0.1:5433/app', { ssl: false, max: 1 });

async function main() {
  const migrationSql = readFileSync(migrationPath, 'utf8');
  console.log(`Applying ${migrationPath} ...`);
  // simple-query protocol: runs the whole file (multiple statements,
  // dollar-quoted DO block, begin/commit) in one round trip.
  await sql.unsafe(migrationSql);
  console.log('Migration applied.');

  const checks = await sql<{ tbl: string; present: boolean }[]>`
    select t.tbl, to_regclass('public.' || t.tbl) is not null as present
    from (values ('task_comments'),('star_transactions'),('market_items'),
                 ('market_orders'),('weekly_task_reports')) as t(tbl)
  `;
  for (const c of checks) console.log(`  ${c.present ? 'OK  ' : 'MISSING '} ${c.tbl}`);

  const [{ has_completed_at }] = await sql<{ has_completed_at: boolean }[]>`
    select exists (
      select 1 from information_schema.columns
      where table_name = 'tasks' and column_name = 'completed_at'
    ) as has_completed_at
  `;
  console.log(`  ${has_completed_at ? 'OK  ' : 'MISSING '} tasks.completed_at`);

  await sql.end();
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
