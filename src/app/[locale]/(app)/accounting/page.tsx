import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { STRATEGY_ROLES } from '@/lib/nav';
import { tashkentDayKey } from '@/lib/time';
import { loadBooks } from '@/lib/accounting-data';
import { AccountingWorkspace } from '@/components/strategy/accounting-workspace';

export const dynamic = 'force-dynamic';

export default async function AccountingPage() {
  const { profile } = await getAuthState();
  if (!profile || !STRATEGY_ROLES.includes(profile.role)) notFound();

  const [books, courseGroups] = await Promise.all([
    loadBooks(),
    sql<{ course: string; groups: number }[]>`
      select trim(course_name) as course, count(*)::int as groups
      from groups where coalesce(trim(course_name), '') <> ''
      group by trim(course_name) order by 2 desc`,
  ]);

  return <AccountingWorkspace books={books} today={tashkentDayKey()} courseGroups={[...courseGroups]} />;
}
