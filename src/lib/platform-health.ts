import 'server-only';
import { sql } from '@/lib/db/client';
import { startOfTashkentMonthKey } from '@/lib/time';

export const CRON_JOBS: Record<string, { n: string; every: string; staleHours: number }> = {
  'task-deadline-reminders': { n: 'Vazifa eslatmalari, rejali postlar', every: 'har 15 daqiqa', staleHours: 2 },
  'task-overdue-penalties': { n: 'Muddati o‘tgan vazifalar jarimasi', every: 'har 15 daqiqa', staleHours: 2 },
  'kpi-reminders': { n: 'KPI va OKR eslatmalari', every: 'har kuni', staleHours: 30 },
  'lesson-plan-check': { n: 'Dars rejasi tekshiruvi', every: 'har kuni', staleHours: 30 },
  'weekly-task-report': { n: 'Haftalik hisobot', every: 'dushanba 06:00', staleHours: 24 * 8 },
  'generate-monthly-lessons': { n: 'Oylik darslar', every: 'har oy', staleHours: 24 * 32 },
  'ai-triage': { n: 'Jev triage', every: 'har soat', staleHours: 3 },
};

export type CronStatus = { job: string; n: string; every: string; last: string | null; ok: boolean | null; fails7d: number; runs7d: number; stale: boolean; detail: string | null };

export type Health = {
  revision: string;
  crons: CronStatus[];
  clientErrors24h: number;
  topErrors: { message: string; n: number }[];
  dbConnections: number | null;
  logs24h: number;
};

export async function loadHealth(): Promise<Health> {
  const [latest, counts, errs, top, conns, logs] = await Promise.all([
    sql<{ job: string; started_at: string; ok: boolean | null; detail: string | null }[]>`
      select distinct on (job) job, started_at, ok, detail from cron_runs order by job, started_at desc`,
    sql<{ job: string; runs: number; fails: number }[]>`
      select job, count(*)::int as runs, count(*) filter (where ok is false)::int as fails
      from cron_runs where started_at > now() - interval '7 days' group by job`,
    sql<{ n: number }[]>`select count(*)::int as n from system_logs where action_type = 'client.error' and created_at > now() - interval '24 hours'`,
    sql<{ message: string; n: number }[]>`
      select split_part(description, E'\\n', 1) as message, count(*)::int as n
      from system_logs where action_type = 'client.error' and created_at > now() - interval '24 hours'
      group by 1 order by 2 desc limit 5`,
    sql<{ n: number }[]>`select count(*)::int as n from pg_stat_activity where datname = current_database()`.catch(() => [{ n: -1 }]),
    sql<{ n: number }[]>`select count(*)::int as n from system_logs where created_at > now() - interval '24 hours'`,
  ]);
  const byJob = new Map(latest.map((r) => [r.job, r]));
  const cnt = new Map(counts.map((r) => [r.job, r]));
  return {
    revision: process.env.K_REVISION ?? 'local',
    crons: Object.entries(CRON_JOBS).map(([job, m]) => {
      const l = byJob.get(job);
      const c = cnt.get(job);
      return {
        job,
        n: m.n,
        every: m.every,
        last: l?.started_at ?? null,
        ok: l?.ok ?? null,
        detail: l?.detail ?? null,
        fails7d: c?.fails ?? 0,
        runs7d: c?.runs ?? 0,
        stale: !l || Date.now() - new Date(l.started_at).getTime() > m.staleHours * 3_600_000,
      };
    }),
    clientErrors24h: errs[0]?.n ?? 0,
    topErrors: top,
    dbConnections: conns[0]?.n ?? null,
    logs24h: logs[0]?.n ?? 0,
  };
}

export type QualityIssue = { key: string; n: string; fix: string; href: string; people: { id: string; name: string }[] };

/** Gaps that make other sections wrong or quiet: no salary, no Telegram, … */
export async function loadDataQuality(): Promise<QualityIssue[]> {
  const month = startOfTashkentMonthKey();
  const rows = await sql<{ id: string; name: string; role: string; telegram: boolean; salary: boolean; hire: boolean; dob: boolean; phone: boolean; avatar: boolean }[]>`
    select p.id, trim(concat(p.first_name, ' ', p.last_name)) as name, p.role::text as role,
      p.telegram_id is not null as telegram,
      exists (select 1 from salary_months s where s.staff_id = p.id and s.period = ${month} and s.gross_amount > 0) as salary,
      p.hire_date is not null as hire, p.date_of_birth is not null as dob,
      coalesce(p.phone, '') <> '' as phone, p.avatar_url is not null as avatar
    from profiles p where p.is_active order by p.first_name`;
  const pick = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).map((r) => ({ id: r.id, name: r.name }));
  return [
    { key: 'salary', n: 'Bu oy maoshi kiritilmagan', fix: 'Moliya › Oylik jarayoni', href: '/finance', people: pick((r) => !r.salary && r.role !== 'ceo') },
    { key: 'telegram', n: 'Telegram ulanmagan (xabar olmaydi)', fix: 'Xodimga Sozlamalar › Telegram', href: '/staff?tab=security', people: pick((r) => !r.telegram) },
    { key: 'hire', n: 'Ishga kirgan sana yo‘q (staj, yillik)', fix: 'HR › Xodim', href: '/hr', people: pick((r) => !r.hire) },
    { key: 'dob', n: 'Tug‘ilgan sana yo‘q (tabrik, kalendar)', fix: 'Profil', href: '/staff', people: pick((r) => !r.dob) },
    { key: 'phone', n: 'Telefon yo‘q', fix: 'Profil', href: '/staff', people: pick((r) => !r.phone) },
    { key: 'avatar', n: 'Rasm yo‘q', fix: 'Profil', href: '/staff', people: pick((r) => !r.avatar) },
  ].filter((q) => q.people.length);
}

export type JournalRow = { id: string; kind: string; key: string; before: string | null; after: string | null; at: string; actor: string | null; target: string | null; reverted: boolean };

export async function loadJournal(): Promise<JournalRow[]> {
  const [changes, logs] = await Promise.all([
    sql<{ id: string; kind: string; key: string; before: string | null; after: string | null; created_at: string; reverted_at: string | null; actor: string | null; target: string | null }[]>`
      select c.id, c.kind, c.key, c.before, c.after, c.created_at, c.reverted_at,
        trim(concat(a.first_name, ' ', a.last_name)) as actor, trim(concat(t.first_name, ' ', t.last_name)) as target
      from platform_changes c left join profiles a on a.id = c.actor left join profiles t on t.id = c.target
      order by c.created_at desc limit 100`,
    sql<{ id: string; action_type: string; description: string; created_at: string; actor: string | null }[]>`
      select l.id::text as id, l.action_type, l.description, l.created_at, trim(concat(p.first_name, ' ', p.last_name)) as actor
      from system_logs l left join profiles p on p.id = l.user_id
      where l.action_type in ('profile_roles', 'role.grant', 'role.revoke', 'sales_target', 'staff.update', 'payroll.move')
      order by l.created_at desc limit 60`.catch(() => []),
  ]);
  return [
    ...changes.map((c) => ({ id: c.id, kind: c.kind, key: c.key, before: c.before, after: c.after, at: c.created_at, actor: c.actor || null, target: c.target || null, reverted: !!c.reverted_at })),
    ...logs.map((l) => ({ id: `log-${l.id}`, kind: l.action_type, key: l.description, before: null, after: null, at: l.created_at, actor: l.actor || null, target: null, reverted: false })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
}
