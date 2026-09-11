/**
 * One-time backfill for the bug fixed in settleTaskStars (actions/tasks.ts):
 * refunds a star_penalty the overdue-penalty cron already charged under a
 * deadline that was later extended, for any task that has since finished
 * on time by the deadline that actually counts now.
 *
 * Runs the exact same guarded, idempotent SQL the fixed settleTaskStars
 * uses for a fresh completion — safe to re-run; a task already refunded
 * (or one whose penalty came from rejectTaskAction, not the cron) simply
 * won't match and is left untouched.
 *
 * Usage:
 *   npx tsx scripts/backfill-stale-task-penalties.ts            (dry run)
 *   npx tsx scripts/backfill-stale-task-penalties.ts --apply    (writes)
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}
const isLocal = /127\.0\.0\.1|localhost/.test(DATABASE_URL);
const sql = postgres(DATABASE_URL, { ssl: isLocal ? false : 'require', max: 1 });

const apply = process.argv.includes('--apply');

async function main() {
  // Candidates: done, on time by the deadline on record now, a cron
  // penalty is still marked applied. Mirrors settleTaskStars's own
  // isLate check (completed_at <= deadline) and its refund guard exactly.
  const candidates = await sql<
    {
      id: string;
      title: string;
      first_name: string;
      last_name: string;
      user_id: string;
      created_by: string;
      star_penalty: number;
    }[]
  >`
    select t.id, t.title, p.first_name, p.last_name, t.assigned_to as user_id,
           t.assigned_by as created_by, t.star_penalty
    from tasks t
    join profiles p on p.id = t.assigned_to
    where t.status = 'done'
      and t.completed_at <= t.deadline
      and t.star_penalty > 0
      and t.star_penalty_applied_at is not null
      and exists (
        select 1 from star_transactions st
        where st.source_type = 'task' and st.source_id = t.id
          and st.reason = 'Deadline bilan ishlanmagani uchun' and st.delta < 0
      )
  `;

  if (candidates.length === 0) {
    console.log('Nothing to refund.');
    await sql.end();
    return;
  }

  console.log(`${candidates.length} task(s) with a stale cron penalty to refund:\n`);
  for (const c of candidates) {
    console.log(`  ${c.first_name} ${c.last_name} — "${c.title}"  +${c.star_penalty}  (task ${c.id})`);
  }

  if (!apply) {
    console.log('\nDry run — pass --apply to write the refunds.');
    await sql.end();
    return;
  }

  let refunded = 0;
  for (const c of candidates) {
    const [row] = await sql<{ star_penalty: number }[]>`
      update tasks set star_penalty_applied_at = null
      where id = ${c.id} and star_penalty > 0 and star_penalty_applied_at is not null
        and exists (
          select 1 from star_transactions st
          where st.source_type = 'task' and st.source_id = ${c.id}
            and st.reason = 'Deadline bilan ishlanmagani uchun' and st.delta < 0
        )
      returning star_penalty
    `;
    if (!row) continue; // already refunded by a concurrent run
    await sql`
      insert into star_transactions (user_id, delta, reason, source_type, source_id, created_by)
      values (${c.user_id}, ${row.star_penalty}, 'Muddat uzaytirilgani uchun avval yechilgan jarima qaytarildi', 'task', ${c.id}, ${c.created_by})
    `;
    refunded += 1;
    console.log(`  refunded +${row.star_penalty} to ${c.first_name} ${c.last_name} for "${c.title}"`);
  }

  console.log(`\nDone — ${refunded} refund(s) written.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
