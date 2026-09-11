/**
 * Read-only audit for the "task went to done but stars never settled" bug.
 *
 * Root cause (fixed in src/lib/format-date.ts): fromDatetimeLocalValue used
 * to parse a deadline picker's zoneless value with the runtime's own local
 * Date parsing, so it only came out correct if the device entering the
 * deadline was itself set to Asia/Tashkent. On any other device, every
 * deadline it produced was silently shifted by that device's UTC offset.
 * settleTaskStars (actions/tasks.ts) then judged on-time/late against that
 * shifted deadline; a task with a reward but no configured penalty (or vice
 * versa) that fell on the wrong side of that judgement settled into
 * nothing at all — done, but neither branch's `> 0` guard matched, so no
 * ledger row, ever.
 *
 * This finds every task in that stuck state: done, something was
 * configured (a reward or a penalty), and neither one ever fired.
 *
 * Usage:
 *   npx tsx scripts/audit-task-star-settlement.ts
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

async function main() {
  const stuck = await sql<
    {
      id: string;
      title: string;
      first_name: string;
      last_name: string;
      deadline: string;
      completed_at: string;
      star_reward: number;
      star_penalty: number;
    }[]
  >`
    select t.id, t.title, p.first_name, p.last_name, t.deadline, t.completed_at,
           t.star_reward, t.star_penalty
    from tasks t
    join profiles p on p.id = t.assigned_to
    where t.status = 'done'
      and t.star_awarded_at is null
      and t.star_penalty_applied_at is null
      and (t.star_reward > 0 or t.star_penalty > 0)
    order by t.completed_at asc
  `;

  if (stuck.length === 0) {
    console.log('No stuck tasks found — every done task with a reward/penalty configured has settled.');
  } else {
    console.log(`${stuck.length} stuck task(s) — done, star_reward/star_penalty configured, neither ever settled:\n`);
    const byPerson = new Map<string, (typeof stuck)[number][]>();
    for (const row of stuck) {
      const key = `${row.first_name} ${row.last_name}`;
      byPerson.set(key, [...(byPerson.get(key) ?? []), row]);
    }
    for (const [name, rows] of byPerson) {
      console.log(`--- ${name} (${rows.length}) ---`);
      for (const r of rows) {
        const deadlineMs = new Date(r.deadline).getTime();
        const completedMs = new Date(r.completed_at).getTime();
        const wasLate = completedMs > deadlineMs;
        console.log(
          `  "${r.title}"  deadline=${r.deadline}  completed=${r.completed_at}  ` +
            `${wasLate ? 'LATE by stored deadline' : 'ON TIME by stored deadline'}  ` +
            `reward=${r.star_reward} penalty=${r.star_penalty}  id=${r.id}`,
        );
      }
    }
  }

  // Broader context: how many tasks in total carry a reward/penalty, and
  // the overall settled/unsettled split, so "how big is this" has a
  // denominator.
  const [totals] = await sql<
    { total_configured: number; settled: number; done_total: number }[]
  >`
    select
      count(*) filter (where star_reward > 0 or star_penalty > 0)::int as total_configured,
      count(*) filter (
        where (star_reward > 0 or star_penalty > 0)
          and (star_awarded_at is not null or star_penalty_applied_at is not null)
      )::int as settled,
      count(*) filter (where status = 'done')::int as done_total
    from tasks
  `;
  console.log(
    `\nContext: ${totals.done_total} tasks done overall; ${totals.total_configured} ever had a reward/penalty configured, ${totals.settled} of those settled one way or the other.`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
