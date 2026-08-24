/**
 * One-time backfill: ensures every existing group has a course_lessons row
 * for every non-Sunday date in the current month. Fixes two things at once —
 * the two groups created since the Cloud Run/Cloud SQL migration that have
 * zero lesson rows (no code path ever seeded them, see
 * generateLessonSlotsForMonth's comment in createGroupAction), and any gaps
 * in the rest of this month for every other group. Safe to re-run: only
 * inserts dates that don't already have a row.
 *
 * Standalone script, so — like create-staff.ts — this connects via a bare
 * `postgres` client instead of importing `@/lib/db/client` or
 * `@/lib/lesson-generation`: both transitively pull in the `server-only`
 * package, which only resolves inside Next's own build/runtime, not under
 * plain `tsx`. The generation logic below is intentionally the same as
 * generateLessonSlotsForMonth in src/lib/lesson-generation.ts — keep them in
 * sync if that logic ever changes.
 *
 * Usage:
 *   npx tsx scripts/backfill-lesson-slots.ts
 */
import postgres from 'postgres';

// Routed through the Cloud SQL Auth Proxy on 127.0.0.1:5433 (already used
// elsewhere this session) rather than .env.local's DATABASE_URL — that
// connects over the public IP, which needs the caller's current egress IP
// authorized in Cloud SQL's authorized-networks list, and that IP has been
// rotating throughout this session.
const sql = postgres('postgres://postgres:rnQTe2aILZonLj0NaWkV8XBb@127.0.0.1:5433/app', { ssl: false });

function toDateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isSunday(dateKey: string): boolean {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay() === 0;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

async function generateLessonSlotsForMonth(groupId: string, year: number, month: number): Promise<number> {
  const total = daysInMonth(year, month);
  const dateKeys: string[] = [];
  for (let day = 1; day <= total; day += 1) {
    const dateKey = toDateKey(year, month, day);
    if (!isSunday(dateKey)) dateKeys.push(dateKey);
  }
  if (dateKeys.length === 0) return 0;

  const [{ maxNumber }] = await sql<{ maxNumber: number }[]>`
    select coalesce(max(lesson_number), 0)::int as "maxNumber" from course_lessons where group_id = ${groupId}
  `;

  const created = await sql<{ id: string }[]>`
    insert into course_lessons (group_id, lesson_number, lesson_date)
    select ${groupId}, ${maxNumber} + row_number() over (order by d), d
    from unnest(${dateKeys}::date[]) as d
    where not exists (
      select 1 from course_lessons cl where cl.group_id = ${groupId} and cl.lesson_date = d
    )
    returning id
  `;
  return created.length;
}

async function main() {
  const tashkentToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const [year, month] = tashkentToday.split('-').map(Number);

  const groups = await sql<{ id: string }[]>`select id from groups`;
  let totalCreated = 0;
  for (const { id: groupId } of groups) {
    const created = await generateLessonSlotsForMonth(groupId, year, month);
    if (created > 0) console.log(`  group ${groupId}: +${created} rows`);
    totalCreated += created;
  }

  console.log(`Done. ${groups.length} groups checked, ${totalCreated} rows created for ${year}-${month}.`);
  await sql.end();
}

main().catch((error) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
