/**
 * Integration check for the payroll lock triggers — runs against a real
 * database and changes nothing: every step happens inside one transaction
 * that is always rolled back.
 *
 * Covers 20261009130000_payroll_runs, 20261010120000_payroll_lock_complete
 * and 20261010140000_payroll_carry_reversal:
 *   - a locked month refuses hand-written ledger rows, edits and deletes;
 *   - the pay run's own rows and reasoned corrections still go in;
 *   - a period-less insert is stamped with the current Tashkent month;
 *   - a counted rag‘bat/jarima cannot change once its month is locked, and
 *     one created after approval rolls into the next month;
 *   - a locked month's self-development bonus cannot change;
 *   - the same component cannot be reversed twice; carry rows need carry_from.
 *
 * Usage (staging first — never point it at production by habit):
 *   DATABASE_URL=... npx tsx scripts/check-payroll-locks.ts
 */
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
const sql = postgres(url, { ssl: isLocal ? false : 'require', max: 1, onnotice: () => {} });

class Rollback extends Error {}
const results: { name: string; ok: boolean; detail?: string }[] = [];

/** Runs `fn` in a savepoint; `expect` is the error text it must raise, or null. */
async function check(tx: postgres.TransactionSql, name: string, expect: RegExp | null, fn: () => Promise<unknown>) {
  try {
    await tx.savepoint(async () => {
      await fn();
      if (expect) throw new Error('__no_error__');
    });
    results.push({ name, ok: !expect });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const ok = !!expect && expect.test(msg);
    results.push({ name, ok, detail: ok ? undefined : msg });
  }
}

async function main() {
  try {
    await sql.begin(async (tx) => {
      const [staff] = await tx<{ id: string }[]>`select id from profiles order by created_at limit 1`;
      if (!staff) throw new Error('No profiles to test with');
      const me = staff.id;
      // A month far in the past that no real run uses.
      const per = '2001-01-01';
      const next = '2001-02-01';

      await tx`delete from pay_runs where period in (${per}, ${next})`;
      const [fe] = await tx<{ id: string }[]>`
        insert into finance_entries (staff_id, title, amount, created_by, kind, period)
        values (${me}, 'check: open month', 1000, ${me}, 'adjustment', ${per}) returning id`;
      const [perf] = await tx<{ id: string }[]>`
        insert into performance_entries (staff_id, entry_type, amount, reason, created_by, created_at)
        values (${me}, 'bonus', 500, 'check', ${me}, '2001-01-10T10:00:00+05') returning id`;
      await tx`
        insert into pay_runs (period, status, approved_at) values (${per}, 'approved', '2001-01-28T10:00:00+05')`;

      await check(tx, 'locked month refuses a hand entry', /period_locked/, () =>
        tx`insert into finance_entries (staff_id, title, amount, created_by, kind, period)
           values (${me}, 'x', 1, ${me}, 'adjustment', ${per})`);
      await check(tx, 'locked month refuses an edit', /period_locked/, () =>
        tx`update finance_entries set amount = 2000 where id = ${fe.id}`);
      await check(tx, 'locked month refuses a delete', /period_locked/, () => tx`delete from finance_entries where id = ${fe.id}`);
      await check(tx, 'pay run may write its own payment', null, () =>
        tx`insert into finance_entries (staff_id, title, amount, created_by, kind, period, source)
           values (${me}, 'pay', 1, ${me}, 'salary', ${per}, 'payrun')`);
      await check(tx, 'correction without a reason is refused', /correction_needs_reason/, () =>
        tx`insert into finance_entries (staff_id, title, amount, created_by, kind, period, source)
           values (${me}, 'c', -1, ${me}, 'penalty', ${per}, 'correction')`);
      await check(tx, 'reasoned correction goes in', null, () =>
        tx`insert into finance_entries (staff_id, title, amount, note, created_by, kind, period, source)
           values (${me}, 'c', -1, 'reason', ${me}, 'penalty', ${per}, 'correction')`);
      await check(tx, 'same component cannot be reversed twice', /uq_finance_entries_reversal_of/, async () => {
        for (let i = 0; i < 2; i++)
          await tx`insert into finance_entries (staff_id, title, amount, note, created_by, kind, period, source, reversal_of)
                   values (${me}, 'r', -1000, 'reason', ${me}, 'penalty', ${per}, 'correction', ${`fe:${fe.id}`})`;
      });
      await check(tx, 'carry row needs carry_from', /finance_entries_carry_shape/, () =>
        tx`insert into finance_entries (staff_id, title, amount, created_by, kind, period, source)
           values (${me}, 'carry', -1, ${me}, 'adjustment', ${next}, 'carry')`);
      await check(tx, 'period-less insert is stamped with the current month', null, async () => {
        const [row] = await tx<{ ok: boolean }[]>`
          insert into finance_entries (staff_id, title, amount, created_by, kind)
          values (${me}, 'no period', 1, ${me}, 'adjustment')
          returning period = date_trunc('month', now() at time zone 'Asia/Tashkent')::date as ok`;
        if (!row.ok) throw new Error('period was not stamped');
      });
      await check(tx, 'counted rag‘bat cannot change once locked', /period_locked/, () =>
        tx`update performance_entries set amount = 900 where id = ${perf.id}`);
      await check(tx, 'counted rag‘bat cannot be deleted once locked', /period_locked/, () =>
        tx`delete from performance_entries where id = ${perf.id}`);
      await check(tx, 'its reason text may still be edited', null, () =>
        tx`update performance_entries set reason = 'check (edited)' where id = ${perf.id}`);
      await check(tx, 'rag‘bat created after approval rolls into next month', null, async () => {
        const [r] = await tx<{ p: string }[]>`select payroll_effective_period('2001-01-30T10:00:00+05')::text as p`;
        if (r.p !== next) throw new Error(`expected ${next}, got ${r.p}`);
      });
      await check(tx, 'self-development bonus of a locked month cannot change', /period_locked/, async () => {
        const [sd] = await tx<{ id: string }[]>`select id from self_development limit 1`;
        if (!sd) return Promise.reject(new Error('period_locked (skipped: no self_development rows)'));
        await tx`update self_development set month = ${per} where id = ${sd.id}`;
        await tx`update self_development set bonus_amount = coalesce(bonus_amount, 0) + 1 where id = ${sd.id}`;
      });

      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  } finally {
    await sql.end();
  }

  for (const r of results) console.log(`${r.ok ? '✔' : '✖'} ${r.name}${r.detail ? `\n    ${r.detail}` : ''}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed — nothing was written (rolled back).`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
