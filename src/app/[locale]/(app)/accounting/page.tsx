import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import { loadBooks } from '@/lib/accounting-data';
import { seatCapacity } from '@/lib/accounting-ma';
import { parsePlan } from '@/lib/ops-plan';
import { AccountingWorkspace } from '@/components/strategy/accounting-workspace';

export const dynamic = 'force-dynamic';

export default async function AccountingPage() {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [books, courseGroups, slots, rooms, plan] = await Promise.all([
    loadBooks(),
    sql<{ course: string; groups: number }[]>`
      select trim(course_name) as course, count(*)::int as groups
      from groups where coalesce(trim(course_name), '') <> ''
      group by trim(course_name) order by 2 desc`,
    // Same basis as the operations plan: timetabled groups (room + time + day
    // cohort) define the rooms in use and the time slots.
    sql<{ room: string; time: string }[]>`
      select distinct trim(configuration->>'room') as room, configuration->>'time' as time
      from groups
      where coalesce(trim(configuration->>'room'), '') <> '' and coalesce(configuration->>'time', '') <> ''
        and schedule_type is not null`,
    sql<{ code: string; capacity: number }[]>`select code, capacity from ops_rooms`,
    sql<{ value: unknown }[]>`select value from ops_settings where key = 'plan'`,
  ]);
  const seatCap = seatCapacity(
    slots.map((s) => s.room),
    [...rooms],
    parsePlan(plan[0]?.value).seats,
    new Set(slots.map((s) => s.time)).size,
  );

  return <AccountingWorkspace books={books} today={tashkentDayKey()} courseGroups={[...courseGroups]} seatCap={seatCap} />;
}
