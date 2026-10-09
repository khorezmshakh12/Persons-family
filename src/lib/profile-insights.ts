import 'server-only';
import { sql } from '@/lib/db/client';
import { startOfTashkentMonthKey, tashkentDayKey, tashkentMidnight } from '@/lib/time';

/** Twelve Tashkent months, oldest first, as 'YYYY-MM-01'. */
function last12(): string[] {
  const cur = startOfTashkentMonthKey();
  const [y, m] = cur.split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const t = y * 12 + (m - 1) - (11 - i);
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
  });
}

import { type ProfileMetricKey } from '@/lib/profile-metrics';
export { PROFILE_METRIC, type ProfileMetricKey } from '@/lib/profile-metrics';

export type ProfileMetrics = {
  months: string[];
  series: Record<ProfileMetricKey, (number | null)[]>;
};

export async function loadProfileMetrics(staffId: string): Promise<ProfileMetrics> {
  const months = last12();
  const from = tashkentMidnight(months[0]).toISOString();
  const [tasks, kpi, sd, stars, issues] = await Promise.all([
    sql<{ m: string; done: number; on_time: number }[]>`
      select to_char(completed_at at time zone 'Asia/Tashkent', 'YYYY-MM-01') as m, count(*)::int as done,
        count(*) filter (where deadline is null or coalesce(submitted_at, completed_at) <= deadline)::int as on_time
      from tasks where assigned_to = ${staffId} and status = 'done' and completed_at >= ${from}
      group by 1`,
    sql<{ m: string; pct: number }[]>`
      select month::text as m, grade_pct::float8 as pct from kpi_plans
      where user_id = ${staffId} and grade is not null and month >= ${months[0]}`,
    sql<{ m: string; score: number }[]>`
      select month::text as m, ceo_score as score from self_development
      where user_id = ${staffId} and ceo_score is not null and month >= ${months[0]}`,
    sql<{ m: string; net: number }[]>`
      select to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM-01') as m, sum(delta)::int as net
      from star_transactions where user_id = ${staffId} and created_at >= ${from} group by 1`,
    sql<{ m: string; n: number }[]>`
      select to_char(resolved_at at time zone 'Asia/Tashkent', 'YYYY-MM-01') as m, count(*)::int as n
      from issues where assigned_to = ${staffId} and status = 'done' and resolved_at >= ${from} group by 1`,
  ]);
  const at = <T,>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
    const map = new Map(rows.map((r) => [key(r).slice(0, 10), val(r)]));
    return months.map((m) => (map.has(m) ? map.get(m)! : null));
  };
  const done = at(tasks, (r) => r.m, (r) => r.done);
  return {
    months,
    series: {
      tasksDone: done.map((v) => v ?? 0),
      onTime: at(tasks, (r) => r.m, (r) => (r.done ? Math.round((r.on_time / r.done) * 100) : 0)),
      kpi: at(kpi, (r) => r.m, (r) => r.pct),
      selfDev: at(sd, (r) => r.m, (r) => r.score),
      stars: at(stars, (r) => r.m, (r) => r.net).map((v) => v ?? 0),
      issues: at(issues, (r) => r.m, (r) => r.n).map((v) => v ?? 0),
    },
  };
}

export type ActivityItem = { at: string; kind: 'task' | 'selfdev' | 'kpi' | 'issue' | 'star' | 'oneOnOne'; text: string; href?: string };

/** The person's notable events, last 30 days, newest first. */
export async function loadProfileActivity(staffId: string, withStars: boolean): Promise<ActivityItem[]> {
  const since = new Date(tashkentMidnight(tashkentDayKey()).getTime() - 30 * 86_400_000).toISOString();
  const [tasks, sd, kpi, issues, stars] = await Promise.all([
    sql<{ at: string; title: string }[]>`
      select completed_at as at, title from tasks
      where assigned_to = ${staffId} and status = 'done' and completed_at >= ${since} order by completed_at desc limit 15`,
    sql<{ at: string; scored: boolean }[]>`
      select created_at as at, ceo_score is not null as scored from self_development
      where user_id = ${staffId} and created_at >= ${since}`,
    sql<{ at: string; pct: number; month: string }[]>`
      select graded_at as at, grade_pct::float8 as pct, month::text as month from kpi_plans
      where user_id = ${staffId} and graded_at >= ${since}`,
    sql<{ at: string; title: string; id: string }[]>`
      select resolved_at as at, title, id from issues
      where assigned_to = ${staffId} and status = 'done' and resolved_at >= ${since} order by resolved_at desc limit 10`,
    withStars
      ? sql<{ at: string; delta: number; reason: string | null }[]>`
          select created_at as at, delta, reason from star_transactions
          where user_id = ${staffId} and created_at >= ${since} order by created_at desc limit 10`
      : Promise.resolve([] as { at: string; delta: number; reason: string | null }[]),
  ]);
  const items: ActivityItem[] = [
    ...tasks.map((t) => ({ at: t.at, kind: 'task' as const, text: `Vazifa bajarildi: ${t.title}`, href: '/tasks' })),
    ...sd.map((s) => ({ at: s.at, kind: 'selfdev' as const, text: s.scored ? 'O‘zini rivojlantirish hisoboti baholandi' : 'O‘zini rivojlantirish hisoboti topshirildi', href: '/self-development' })),
    ...kpi.map((k) => ({ at: k.at, kind: 'kpi' as const, text: `KPI baholandi: ${k.pct > 0 ? '+' : ''}${Math.round(k.pct)}%`, href: '/my-kpi' })),
    ...issues.map((i) => ({ at: i.at, kind: 'issue' as const, text: `Muammo hal qilindi: ${i.title}`, href: '/issues' })),
    ...stars.map((s) => ({ at: s.at, kind: 'star' as const, text: `${s.delta > 0 ? '+' : ''}${s.delta} ★${s.reason ? ` — ${s.reason}` : ''}` })),
  ];
  return items.filter((i) => i.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 25);
}

export type ProfileCard = {
  bio: string | null;
  hire_date: string | null;
  date_of_birth: string | null;
  last_seen_at: string | null;
  chat_status: string | null;
  telegram: boolean;
  positions: string[];
  dept: string | null;
  completeness: { pct: number; missing: string[] };
};

export async function loadProfileCard(staffId: string): Promise<ProfileCard> {
  const [[p], roles, [skills]] = await Promise.all([
    sql<{ bio: string | null; hire_date: string | null; date_of_birth: string | null; last_seen_at: string | null; chat_status: string | null; chat_status_until: string | null; telegram_id: number | null; avatar_url: string | null; phone: string | null; emergency_contact: string | null }[]>`
      select bio, hire_date::text as hire_date, date_of_birth::text as date_of_birth, last_seen_at, chat_status, chat_status_until,
        telegram_id, avatar_url, phone, emergency_contact
      from profiles where id = ${staffId}`,
    sql<{ role: string }[]>`select role::text as role from profile_roles where user_id = ${staffId}`,
    sql<{ n: number }[]>`select count(*)::int as n from profile_skills where staff_id = ${staffId}`,
  ]);
  const checks: [boolean, string][] = [
    [!!p?.avatar_url, 'Rasm'],
    [!!p?.phone, 'Telefon'],
    [!!p?.emergency_contact, 'Favqulodda aloqa'],
    [!!p?.telegram_id, 'Telegram'],
    [!!p?.bio, 'O‘zi haqida'],
    [!!p?.hire_date, 'Ishga kirgan sana'],
    [!!p?.date_of_birth, 'Tug‘ilgan sana'],
    [(skills?.n ?? 0) > 0, 'Ko‘nikmalar'],
  ];
  const ok = checks.filter(([v]) => v).length;
  const statusLive = p?.chat_status && (!p.chat_status_until || new Date(p.chat_status_until).getTime() > Date.now()) ? p.chat_status : null;
  return {
    bio: p?.bio ?? null,
    hire_date: p?.hire_date ?? null,
    date_of_birth: p?.date_of_birth ?? null,
    last_seen_at: p?.last_seen_at ?? null,
    chat_status: statusLive,
    telegram: !!p?.telegram_id,
    positions: roles.map((r) => r.role),
    dept: null,
    completeness: { pct: Math.round((ok / checks.length) * 100), missing: checks.filter(([v]) => !v).map(([, n]) => n) },
  };
}

export type Skill = { id: string; name: string; level: number; verified: boolean };
export async function loadSkills(staffId: string): Promise<Skill[]> {
  const rows = await sql<{ id: string; name: string; level: number; verified_at: string | null }[]>`
    select id, name, level, verified_at from profile_skills where staff_id = ${staffId} order by level desc, name`;
  return rows.map((r) => ({ id: r.id, name: r.name, level: r.level, verified: !!r.verified_at }));
}

export type WorkSnapshot = {
  tasks: { id: string; title: string; status: string; deadline: string | null }[];
  krs: { id: string; title: string; objective: string; progress: number | null }[];
  groups: { id: string; name: string }[];
};

export async function loadWork(staffId: string): Promise<WorkSnapshot> {
  const [tasks, krs, groups] = await Promise.all([
    sql<WorkSnapshot['tasks']>`
      select id, title, status, deadline from tasks
      where assigned_to = ${staffId} and status <> 'done'
      order by deadline nulls last limit 20`,
    sql<{ id: string; title: string; objective: string; start_value: number | null; target_value: number | null; current: number | null }[]>`
      select k.id, k.title, o.title as objective, k.start_value, k.target_value, k.current_value as current
      from strategy_key_results k join strategy_objectives o on o.id = k.objective_id
      where k.owner_id = ${staffId} and o.status = 'active' limit 20`.catch(() => []),
    sql<WorkSnapshot['groups']>`select id, name from groups where teacher_id = ${staffId} order by name limit 30`.catch(() => []),
  ]);
  return {
    tasks,
    krs: krs.map((k) => ({
      id: k.id,
      title: k.title,
      objective: k.objective,
      progress:
        k.current !== null && k.target_value !== null && k.start_value !== null && k.target_value !== k.start_value
          ? Math.max(0, Math.min(100, Math.round(((k.current - k.start_value) / (k.target_value - k.start_value)) * 100)))
          : null,
    })),
    groups,
  };
}

export type OneOnOne = { id: string; held_on: string; agenda: string; notes: string; mood: number | null; lead: string; task_ids: string[] };
export async function loadOneOnOnes(staffId: string): Promise<OneOnOne[]> {
  const rows = await sql<{ id: string; held_on: string; agenda: string; notes: string; mood: number | null; first_name: string | null; last_name: string | null; task_ids: string[] }[]>`
    select o.id, o.held_on::text as held_on, o.agenda, o.notes, o.mood, o.task_ids, p.first_name, p.last_name
    from one_on_ones o left join profiles p on p.id = o.lead_id
    where o.staff_id = ${staffId} order by o.held_on desc, o.created_at desc limit 30`;
  return rows.map((r) => ({ id: r.id, held_on: r.held_on, agenda: r.agenda, notes: r.notes, mood: r.mood, task_ids: r.task_ids, lead: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() }));
}

export type PrivateNote = { id: string; body: string; at: string; author: string };
export async function loadPrivateNotes(staffId: string): Promise<PrivateNote[]> {
  const rows = await sql<{ id: string; body: string; created_at: string; first_name: string | null; last_name: string | null }[]>`
    select n.id, n.body, n.created_at, p.first_name, p.last_name
    from staff_private_notes n left join profiles p on p.id = n.author_id
    where n.staff_id = ${staffId} order by n.created_at desc limit 50`;
  return rows.map((r) => ({ id: r.id, body: r.body, at: r.created_at, author: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() }));
}
