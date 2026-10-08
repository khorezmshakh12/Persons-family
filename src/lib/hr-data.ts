import 'server-only';
import { sql } from '@/lib/db/client';
import { getStarBalances } from '@/lib/stars';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { ROLE_DEPT, type Department, type Role } from '@/lib/permissions';

/**
 * One person in the HR hub, with the 360° figures gathered from the other
 * sections (nothing is entered twice). Salary is deliberately absent —
 * pay lives in Finance only.
 */
export type HrPerson = {
  id: string;
  name: string;
  first_name: string;
  role: Role;
  roles: Role[];
  dept: Department;
  avatar: string | null;
  phone: string | null;
  date_of_birth: string | null;
  hire_date: string | null;
  probation_until: string | null;
  stars: number;
  /** Last six months' KPI grades, oldest first ('bad' | 'good' | 'great' | null). */
  kpi: { month: string; grade: string | null }[];
  /** Latest self-development score and the months filed in a row. */
  selfDev: { score: number | null; months: number };
  /** Tasks: share done on time (0–100) and currently overdue. */
  tasks: { onTime: number | null; overdue: number; open: number };
  /** Teachers: lesson plans complete at the deadline, last 30 days (0–100). */
  lessons: number | null;
  onboarding: { done: number; total: number };
};

export async function loadHrPeople(onlyId?: string): Promise<HrPerson[]> {
  const people = await sql<
    { id: string; first_name: string; last_name: string; role: Role; roles: Role[]; avatar_url: string | null; phone: string | null; date_of_birth: string | null; hire_date: string | null; probation_until: string | null }[]
  >`
    select p.id, p.first_name, p.last_name, p.role, p.avatar_url, p.phone,
      p.date_of_birth::text as date_of_birth, p.hire_date::text as hire_date, p.probation_until::text as probation_until,
      coalesce(array(select r.role::text from profile_roles r where r.user_id = p.id order by r.role), '{}') as roles
    from profiles p
    where p.is_active and (${onlyId ?? null}::uuid is null or p.id = ${onlyId ?? null})
    order by p.first_name, p.last_name`;
  if (people.length === 0) return [];
  const ids = people.map((p) => p.id);

  const [stars, kpi, sd, tasks, lessons, onboarding, avatars] = await Promise.all([
    getStarBalances(ids),
    sql<{ user_id: string; month: string; grade: string | null }[]>`
      select user_id, month::text as month, grade from kpi_plans
      where user_id in ${sql(ids)} and month >= (date_trunc('month', now() at time zone 'Asia/Tashkent') - interval '5 months')::date
      order by month`.catch(() => []),
    sql<{ user_id: string; month: string; ceo_score: number | null }[]>`
      select user_id, month::text as month, ceo_score from self_development
      where user_id in ${sql(ids)} order by month desc`.catch(() => []),
    sql<{ user_id: string; done: number; on_time: number; overdue: number; open: number }[]>`
      select assigned_to as user_id,
        count(*) filter (where status = 'done')::int as done,
        count(*) filter (where status = 'done' and completed_at <= deadline)::int as on_time,
        count(*) filter (where status in ('pending', 'in_progress') and deadline < now())::int as overdue,
        count(*) filter (where status in ('pending', 'in_progress'))::int as open
      from tasks where assigned_to in ${sql(ids)} group by assigned_to`.catch(() => []),
    sql<{ teacher_id: string; total: number; ok: number }[]>`
      select teacher_id, count(*)::int as total, count(*) filter (where status = 'complete')::int as ok
      from lesson_plan_daily where teacher_id in ${sql(ids)} and date_key >= current_date - 30
      group by teacher_id`.catch(() => []),
    sql<{ user_id: string; total: number; done: number }[]>`
      select user_id, count(*)::int as total, count(done_at)::int as done
      from onboarding_items where user_id in ${sql(ids)} group by user_id`.catch(() => []),
    Promise.all(people.map((p) => resolveAvatarUrl(p.avatar_url))),
  ]);

  return people.map((p, i) => {
    const mine = sd.filter((s) => s.user_id === p.id);
    let streak = 0;
    for (const s of mine) {
      // Consecutive months, newest first.
      const expected = new Date(Date.UTC(Number(mine[0].month.slice(0, 4)), Number(mine[0].month.slice(5, 7)) - 1 - streak, 1)).toISOString().slice(0, 10);
      if (s.month !== expected) break;
      streak += 1;
    }
    const tk = tasks.find((t) => t.user_id === p.id);
    const ls = lessons.find((l) => l.teacher_id === p.id);
    const ob = onboarding.find((o) => o.user_id === p.id);
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      first_name: p.first_name,
      role: p.role,
      roles: p.roles?.length ? p.roles : [p.role],
      dept: ROLE_DEPT[p.role] ?? 'ops',
      avatar: avatars[i],
      phone: p.phone,
      date_of_birth: p.date_of_birth,
      hire_date: p.hire_date,
      probation_until: p.probation_until,
      stars: stars[p.id] ?? 0,
      kpi: kpi.filter((k) => k.user_id === p.id).map((k) => ({ month: k.month, grade: k.grade })),
      selfDev: { score: mine[0]?.ceo_score ?? null, months: streak },
      tasks: { onTime: tk && tk.done ? Math.round((tk.on_time / tk.done) * 100) : null, overdue: tk?.overdue ?? 0, open: tk?.open ?? 0 },
      lessons: ls && ls.total ? Math.round((ls.ok / ls.total) * 100) : null,
      onboarding: { done: ob?.done ?? 0, total: ob?.total ?? 0 },
    };
  });
}

export type OnboardingItem = { id: string; user_id: string; title: string; done_at: string | null };

export async function loadOnboarding(userIds: string[]): Promise<OnboardingItem[]> {
  if (userIds.length === 0) return [];
  return sql<OnboardingItem[]>`
    select id, user_id, title, done_at::text as done_at from onboarding_items
    where user_id in ${sql(userIds)} order by sort, created_at`.catch(() => []);
}
