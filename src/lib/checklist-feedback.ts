import 'server-only';
import { sql } from '@/lib/db/client';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

export type ChecklistFeedback = {
  id: string;
  userId: string;
  day: string;
  /** null = a note on the whole day. */
  templateId: string | null;
  itemTitle: string | null;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
};

type Row = {
  id: string;
  user_id: string;
  day: string;
  template_id: string | null;
  item_title: string | null;
  body: string;
  author_id: string | null;
  author_name: string | null;
  created_at: string;
};

const toFeedback = (r: Row): ChecklistFeedback => ({
  id: r.id,
  userId: r.user_id,
  day: r.day,
  templateId: r.template_id,
  itemTitle: r.item_title,
  body: r.body,
  authorId: r.author_id,
  authorName: r.author_name?.trim() || '—',
  createdAt: r.created_at,
});

/** Every note left on that day, for the team view. */
export async function loadDayFeedback(day: string): Promise<ChecklistFeedback[]> {
  const rows = await sql<Row[]>`
    select f.id, f.user_id, f.day::text as day, f.template_id, f.item_title, f.body, f.author_id,
      concat(a.first_name, ' ', a.last_name) as author_name, f.created_at
    from checklist_feedback f left join profiles a on a.id = f.author_id
    where f.day = ${day}::date
    order by f.created_at asc
  `.catch(() => []);
  return rows.map(toFeedback);
}

/** Notes on one employee's checklist over the last `days` days, newest first. */
export async function loadMyFeedback(userId: string, days = 7): Promise<ChecklistFeedback[]> {
  const from = addDaysToKey(tashkentDayKey(), -(days - 1));
  const rows = await sql<Row[]>`
    select f.id, f.user_id, f.day::text as day, f.template_id, f.item_title, f.body, f.author_id,
      concat(a.first_name, ' ', a.last_name) as author_name, f.created_at
    from checklist_feedback f left join profiles a on a.id = f.author_id
    where f.user_id = ${userId} and f.day >= ${from}::date
    order by f.created_at desc
    limit 50
  `.catch(() => []);
  return rows.map(toFeedback);
}
