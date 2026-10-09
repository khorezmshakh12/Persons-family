import 'server-only';
import { sql } from '@/lib/db/client';
import { can, canSeeFor, ROLE_DEPT, type Role } from '@/lib/permissions';
import type { Profile } from '@/lib/auth/session';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { occurrences, sortEvents, yearlyIn, type CalEvent, type EventKind, type Layer, type NewsCategory, type Repeat } from '@/lib/team-life';

const nm = (f: string | null, l: string | null) => `${f ?? ''} ${l ?? ''}`.trim() || 'Xodim';
const tk = (iso: string) => tashkentDayKey(new Date(iso));
const tTime = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(11, 16);

function monthEnd(key: string) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Everything on the team calendar between two Tashkent days (inclusive). */
export async function loadCalendar(viewer: Profile, from: string, to: string, scope: 'mine' | 'all' = 'all'): Promise<CalEvent[]> {
  const lead = can(viewer.role, 'company.overview');
  const hrView = lead || ROLE_DEPT[viewer.role as Role] === 'hr';
  const allTasks = lead && scope === 'all';
  const fromTs = `${from}T00:00:00+05:00`;
  const toTs = `${addDaysToKey(to, 1)}T00:00:00+05:00`;

  const [events, rsvps, tasks, milestones, people, core, ones, lessons] = await Promise.all([
    sql<{ id: string; title: string; description: string; starts_at: string; ends_at: string | null; all_day: boolean; location: string; kind: string; repeat: Repeat; repeat_until: string | null; created_by: string | null }[]>`
      select id, title, description, starts_at, ends_at, all_day, location, kind, repeat, repeat_until::text as repeat_until, created_by
      from events where deleted_at is null and starts_at < ${toTs}
        and (repeat <> 'none' or coalesce(ends_at, starts_at) >= ${fromTs})`,
    sql<{ event_id: string; user_id: string; response: 'yes' | 'no' | 'maybe' }[]>`select event_id, user_id, response from event_attendees`,
    sql<{ id: string; title: string; deadline: string; first_name: string | null; last_name: string | null; status: string }[]>`
      select t.id, t.title, t.deadline, p.first_name, p.last_name, t.status from tasks t left join profiles p on p.id = t.assigned_to
      where t.deadline >= ${fromTs} and t.deadline < ${toTs} and t.status <> 'done'
        and ${allTasks ? sql`true` : sql`t.assigned_to = ${viewer.id}`}`,
    canSeeFor(viewer, 'strategy')
      ? sql<{ id: string; title: string; date: string; space: string }[]>`
          select m.id, m.title, m.date::text as date, s.name as space from strategy_milestones m join strategy_spaces s on s.id = m.space_id
          where m.date >= ${from} and m.date <= ${to}`.catch(() => [])
      : Promise.resolve([] as { id: string; title: string; date: string; space: string }[]),
    sql<{ id: string; first_name: string | null; last_name: string | null; date_of_birth: string | null; hire_date: string | null; role: string }[]>`
      select id, first_name, last_name, date_of_birth::text as date_of_birth, hire_date::text as hire_date, role from profiles where is_active`,
    sql<{ leave: unknown; keys: Record<string, string> | null }[]>`select data->'leave' as leave, data->'keys' as keys from core_state where id = 1`,
    sql<{ id: string; held_on: string; staff_id: string; lead_id: string }[]>`
      select id, held_on::text as held_on, staff_id, lead_id from one_on_ones
      where held_on >= ${from} and held_on <= ${to} and (staff_id = ${viewer.id} or lead_id = ${viewer.id})`.catch(() => []),
    sql<{ id: string; lesson_date: string; topic: string | null; group_id: string; group_name: string }[]>`
      select cl.id, cl.lesson_date::text as lesson_date, cl.topic, g.id as group_id, g.name as group_name
      from course_lessons cl join groups g on g.id = cl.group_id
      where cl.lesson_date >= ${from} and cl.lesson_date <= ${to}
        and (${can(viewer.role, 'academic.viewAll') && scope === 'all'} or g.teacher_id = ${viewer.id} or g.assigned_ta_id = ${viewer.id})
      limit 600`.catch(() => []),
  ]);

  const byId = new Map(people.map((p) => [p.id, p]));
  const out: CalEvent[] = [];

  for (const e of events) {
    const startDay = tk(e.starts_at);
    const spanDays = e.ends_at ? Math.max(0, Math.round((new Date(tk(e.ends_at)).getTime() - new Date(startDay).getTime()) / 86_400_000)) : 0;
    const rs = rsvps.filter((r) => r.event_id === e.id);
    for (const day of occurrences(startDay, e.repeat, e.repeat_until, addDaysToKey(from, -spanDays), to)) {
      out.push({
        id: `ev-${e.id}-${day}`,
        eventId: e.id,
        layer: 'company',
        title: e.title,
        day,
        endDay: spanDays ? addDaysToKey(day, spanDays) : undefined,
        time: e.all_day ? undefined : tTime(e.starts_at),
        meta: [e.location, e.description].filter(Boolean).join(' · ') || undefined,
        rsvp: {
          mine: rs.find((r) => r.user_id === viewer.id)?.response ?? null,
          yes: rs.filter((r) => r.response === 'yes').length,
          no: rs.filter((r) => r.response === 'no').length,
          maybe: rs.filter((r) => r.response === 'maybe').length,
        },
        editable: lead || e.created_by === viewer.id,
        raw: { description: e.description, location: e.location, kind: e.kind as EventKind, repeat: e.repeat, repeatUntil: e.repeat_until },
      });
    }
  }
  for (const t of tasks)
    out.push({ id: `task-${t.id}`, layer: 'task', title: t.title, day: tk(t.deadline), time: tTime(t.deadline), href: '/tasks', meta: allTasks ? nm(t.first_name, t.last_name) : undefined });
  for (const m of milestones) out.push({ id: `ms-${m.id}`, layer: 'milestone', title: m.title, day: m.date, href: '/strategy', meta: m.space });
  for (const p of scope === 'mine' ? people.filter((x) => x.id === viewer.id) : people) {
    if (p.date_of_birth)
      for (const day of yearlyIn(p.date_of_birth, from, to)) out.push({ id: `bd-${p.id}-${day}`, layer: 'birthday', title: `${nm(p.first_name, p.last_name)} — tug‘ilgan kun`, day, href: `/profile/${p.id}` });
    if (p.hire_date)
      for (const day of yearlyIn(p.hire_date, from, to)) {
        const years = Number(day.slice(0, 4)) - Number(p.hire_date.slice(0, 4));
        if (years >= 1) out.push({ id: `an-${p.id}-${day}`, layer: 'anniversary', title: `${nm(p.first_name, p.last_name)} — ${years} yil jamoada`, day, href: `/profile/${p.id}` });
      }
  }

  // Leave lives in Core's shared state, keyed by Core's short staff keys.
  const leave = Array.isArray(core[0]?.leave) ? (core[0].leave as { id: unknown; k: string; from: number; to: number; type?: string; st?: string }[]) : [];
  const keyToId = Object.fromEntries(Object.entries(core[0]?.keys ?? {}).map(([id, k]) => [k, id]));
  for (const l of leave) {
    if (l.st === 'no' || typeof l.from !== 'number' || typeof l.to !== 'number') continue;
    const a = tashkentDayKey(new Date(l.from));
    const b = tashkentDayKey(new Date(l.to));
    if (b < from || a > to) continue;
    const pid = keyToId[l.k];
    const p = pid ? byId.get(pid) : undefined;
    // Other people's leave reasons stay in the team view for HR / leadership;
    // the personal ('mine') scope — and so the .ics feed — never carries them.
    if (scope === 'mine' && pid !== viewer.id) continue;
    const mineOrHr = pid === viewer.id || (hrView && scope === 'all');
    out.push({
      id: `lv-${String(l.id)}`,
      layer: 'leave',
      title: `${p ? nm(p.first_name, p.last_name) : l.k} — ${mineOrHr ? (l.type ?? 'Ta’til') : 'ishda emas'}${l.st === 'pending' && mineOrHr ? ' (kutilmoqda)' : ''}`,
      day: a < from ? from : a,
      endDay: b > to ? to : b,
      href: mineOrHr ? '/hr' : undefined,
    });
  }

  for (const o of ones) {
    const other = byId.get(o.staff_id === viewer.id ? o.lead_id : o.staff_id);
    out.push({ id: `oo-${o.id}`, layer: 'oneOnOne', title: `1:1 — ${other ? nm(other.first_name, other.last_name) : ''}`, day: o.held_on, href: `/profile/${o.staff_id}?tab=people` });
  }
  for (const l of lessons) out.push({ id: `ls-${l.id}`, layer: 'lesson', title: `${l.group_name}${l.topic ? ` · ${l.topic}` : ''}`, day: l.lesson_date, href: `/lesson-plans/${l.group_id}` });

  // The self-development report is due on the last day of each month.
  if (viewer.role !== 'ceo') {
    let k = `${from.slice(0, 7)}-01`;
    while (k <= to) {
      const end = monthEnd(k);
      if (end >= from && end <= to) out.push({ id: `dl-sd-${end}`, layer: 'deadline', title: 'O‘zini rivojlantirish hisoboti — oxirgi kun', day: end, href: '/self-development' });
      const [y, m] = k.split('-').map(Number);
      k = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    }
  }
  return sortEvents(out);
}

export type FeedNews = {
  id: string;
  title: string;
  content: string;
  category: NewsCategory;
  pinned: boolean;
  must_ack: boolean;
  publish_at: string | null;
  created_at: string;
  created_by: string | null;
  author: string | null;
  image_url: string | null;
  audience: string;
  scheduled: boolean;
  reads: number;
  acks: number;
  acked: boolean;
  reactions: { emoji: string; n: number; mine: boolean }[];
};

export async function loadNewsFeed(viewer: Profile, isAdmin: boolean): Promise<{ news: FeedNews[]; audience: number }> {
  const dept = ROLE_DEPT[viewer.role as Role];
  const [rows, reactions, [{ n: audience }]] = await Promise.all([
    sql<(Omit<FeedNews, 'author' | 'scheduled' | 'reactions' | 'acked'> & { first_name: string | null; last_name: string | null; acked: boolean })[]>`
      select n.id, n.title, n.content, n.category, n.pinned, n.must_ack, n.publish_at, n.created_at, n.created_by, n.image_url, n.audience,
        p.first_name, p.last_name,
        (select count(*)::int from company_news_reads r where r.news_id = n.id) as reads,
        (select count(*)::int from company_news_acks a where a.news_id = n.id) as acks,
        exists (select 1 from company_news_acks a where a.news_id = n.id and a.user_id = ${viewer.id}) as acked
      from company_news n left join profiles p on p.id = n.created_by
      where n.deleted_at is null
        and (n.pinned or n.must_ack or n.created_at >= now() - interval '60 days')
        and (${isAdmin} or n.created_by = ${viewer.id} or n.publish_at is null or n.publish_at <= now())
        and (${isAdmin} or n.audience = 'all' or n.audience = ${dept})
      order by n.pinned desc, coalesce(n.publish_at, n.created_at) desc
      limit 80`,
    sql<{ news_id: string; emoji: string; n: number; mine: boolean }[]>`
      select news_id, emoji, count(*)::int as n, bool_or(user_id = ${viewer.id}) as mine
      from company_news_reactions group by news_id, emoji`,
    sql<{ n: number }[]>`select count(*)::int as n from profiles where is_active`,
  ]);
  const now = Date.now();
  return {
    audience,
    news: rows.map(({ first_name, last_name, ...r }) => ({
      ...r,
      author: first_name ? nm(first_name, last_name) : null,
      scheduled: !!r.publish_at && new Date(r.publish_at).getTime() > now,
      reactions: reactions.filter((x) => x.news_id === r.id).map(({ emoji, n, mine }) => ({ emoji, n, mine })),
    })),
  };
}

export async function newsAudience(newsId: string): Promise<{ acked: string[]; read: string[]; pending: string[] }> {
  const rows = await sql<{ name: string; read: boolean; acked: boolean }[]>`
    select trim(concat(p.first_name, ' ', p.last_name)) as name,
      exists (select 1 from company_news_reads r where r.news_id = ${newsId} and r.user_id = p.id) as read,
      exists (select 1 from company_news_acks a where a.news_id = ${newsId} and a.user_id = p.id) as acked
    from profiles p where p.is_active order by p.first_name`;
  return {
    acked: rows.filter((r) => r.acked).map((r) => r.name),
    read: rows.filter((r) => r.read && !r.acked).map((r) => r.name),
    pending: rows.filter((r) => !r.read && !r.acked).map((r) => r.name),
  };
}

export const LAYER_DEFAULT: Layer[] = ['company', 'task', 'milestone', 'leave', 'birthday', 'anniversary', 'deadline', 'oneOnOne', 'lesson'];
