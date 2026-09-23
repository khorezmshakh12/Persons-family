/**
 * Static guardrails for bug classes this codebase has actually shipped.
 * They read source files as text — no database, no Next.js runtime — so they
 * run in CI next to tsc/eslint. When one fails, read its message before
 * "fixing" the test: it usually means a real hole.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

// ---------------------------------------------------------------------------
// Every Server Action re-checks auth itself. A page/layout guard does not
// protect the POST endpoint behind it (see AGENTS.md).
// ---------------------------------------------------------------------------

/** Calls that establish who the caller is (and that they are allowed). */
const AUTH_CHECK = /\b(getAuthState|require[A-Z]\w*|loadForReview|lessonWriteDenial)\s*\(/;

/** Actions that are public by design. Adding to this list needs a reason. */
const PUBLIC_ACTIONS = new Set([
  'loginAction', // the unauthenticated entry point itself
  'logoutAction', // only ever clears the caller's own cookie
]);

test('every exported Server Action performs an auth check', () => {
  const dir = 'src/lib/actions';
  const missing: string[] = [];
  for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.ts'))) {
    const source = read(`${dir}/${file}`);
    if (!/^\s*['"]use server['"]/.test(source)) continue;
    const chunks = source.split(/^export async function /m).slice(1);
    for (const chunk of chunks) {
      const name = chunk.match(/^(\w+)/)?.[1] ?? '?';
      // Body = everything up to the next top-level declaration.
      const body = chunk.split(/^(?:export |async function |function |const |type )/m)[0];
      if (!PUBLIC_ACTIONS.has(name) && !AUTH_CHECK.test(body)) missing.push(`${file}: ${name}`);
    }
  }
  assert.deepEqual(missing, [], `Server Actions with no auth check:\n  ${missing.join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// Translations: a key missing in one locale renders as a raw key (or throws)
// for that language only — easy to miss when testing in one language.
// ---------------------------------------------------------------------------

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flatKeys(child, prefix ? `${prefix}.${key}` : key));
}

test('en / ru / uz translations have the same keys', () => {
  const [en, ru, uz] = ['en', 'ru', 'uz'].map((locale) => new Set(flatKeys(JSON.parse(read(`messages/${locale}.json`)))));
  for (const [name, keys] of [['ru', ru], ['uz', uz]] as const) {
    assert.deepEqual([...en].filter((k) => !keys.has(k)), [], `keys missing from ${name}.json`);
    assert.deepEqual([...keys].filter((k) => !en.has(k)), [], `keys only in ${name}.json`);
  }
});

// ---------------------------------------------------------------------------
// Migrations: scripts/migrate.ts requires each file to be one self-contained
// transaction, and runs them in filename order before every deploy.
// ---------------------------------------------------------------------------

/** Mirrors BASELINE_THROUGH in scripts/migrate.ts: files at or before it were
 * already live when the runner was adopted and are never executed by it. */
const MIGRATION_BASELINE_THROUGH = '20260901000000';

test('every migration is a self-contained begin; … commit; transaction', () => {
  const dir = 'supabase/migrations';
  const files = readdirSync(join(root, dir))
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => f.slice(0, 14) > MIGRATION_BASELINE_THROUGH);
  for (const file of files) {
    assert.match(file, /^\d{14}_[a-z0-9_]+\.sql$/, `${file}: name must be <14-digit timestamp>_<snake_case>.sql`);
    const sql = read(`${dir}/${file}`)
      .replace(/--[^\n]*/g, '')
      .trim()
      .toLowerCase();
    assert.ok(sql.startsWith('begin;'), `${file}: must start with begin;`);
    assert.ok(sql.endsWith('commit;'), `${file}: must end with commit;`);
  }
});
