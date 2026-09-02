/**
 * Minimal migration runner — there is no ORM/framework here.
 *
 *   - Tracks applied files in a `schema_migrations` table.
 *   - Applies every `supabase/migrations/*.sql` not yet recorded, in
 *     filename order.
 *   - Files with a timestamp prefix <= BASELINE_THROUGH are assumed already
 *     live (this is what the DB looked like when the runner was adopted) and
 *     are recorded WITHOUT executing — re-running them would error
 *     (e.g. `disable trigger` on a trigger that no longer exists).
 *
 * Each migration file MUST be a self-contained transaction: start with
 * `begin;`, end with `commit;`. Statements should be idempotent
 * (`if not exists`, additive) so a re-run after a partial failure is safe.
 *
 * Connection: DATABASE_URL (through the Cloud SQL Auth Proxy in CI, or
 * directly for local dev). Runs with a single connection so the file's own
 * begin/commit is allowed.
 *
 * Usage:
 *   npx tsx scripts/migrate.ts            # apply pending
 *   npx tsx scripts/migrate.ts --dry-run # list pending, change nothing
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const BASELINE_THROUGH = '20260901000000';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'supabase', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1 });

const dryRun = process.argv.includes('--dry-run');

async function main() {
  await sql`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now(),
      baselined   boolean not null default false
    )
  `;

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRows = await sql<{ filename: string }[]>`select filename from schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) {
    console.log(`Up to date — ${files.length} migration(s), all applied.`);
    await sql.end();
    return;
  }

  for (const file of pending) {
    const prefix = file.slice(0, 14);
    const isBaseline = prefix <= BASELINE_THROUGH;

    if (isBaseline) {
      console.log(`baseline  ${file}  (recorded, not executed)`);
      if (!dryRun) {
        await sql`insert into schema_migrations (filename, baselined) values (${file}, true)`;
      }
      continue;
    }

    if (dryRun) {
      console.log(`pending   ${file}`);
      continue;
    }

    console.log(`applying  ${file} ...`);
    const contents = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      await sql.unsafe(contents);
    } catch (error) {
      console.error(`FAILED on ${file}: ${error instanceof Error ? error.message : error}`);
      await sql.end();
      process.exit(1);
    }
    await sql`insert into schema_migrations (filename) values (${file})`;
    console.log(`applied   ${file}`);
  }

  console.log(dryRun ? 'Dry run complete.' : 'Migrations complete.');
  await sql.end();
}

main().catch(async (error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  await sql.end().catch(() => {});
  process.exit(1);
});
