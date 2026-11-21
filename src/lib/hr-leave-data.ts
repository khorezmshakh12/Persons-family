import 'server-only';
import { sql } from '@/lib/db/client';
import { leaveDays, type LeaveKind, type LeaveRow, type LeaveStatus, type Vacancy } from '@/lib/hr-leave';

type Row = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  kind: LeaveKind;
  from_day: string;
  to_day: string;
  reason: string | null;
  status: LeaveStatus;
  decider: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

/** Leave requests — one person's (userId) or everyone's; newest first. */
export async function loadLeave(userId?: string): Promise<LeaveRow[]> {
  const rows = await sql<Row[]>`
    select l.id, l.user_id, p.first_name, p.last_name, l.kind, l.from_day::text as from_day, l.to_day::text as to_day,
      l.reason, l.status, trim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')) as decider,
      l.decided_at, l.decision_note, l.created_at
    from leave_requests l
    join profiles p on p.id = l.user_id
    left join profiles d on d.id = l.decided_by
    where ${userId ? sql`l.user_id = ${userId}` : sql`true`}
    order by l.created_at desc
    limit 400`.catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Nomsiz',
    kind: r.kind,
    from: r.from_day,
    to: r.to_day,
    days: leaveDays(r.from_day, r.to_day),
    reason: r.reason,
    status: r.status,
    decidedBy: r.decider || null,
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    note: r.decision_note,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function loadVacancies(): Promise<Vacancy[]> {
  const rows = await sql<
    {
      id: string;
      title: string;
      dept: string;
      seats: number;
      status: 'open' | 'closed';
      opened_at: string;
      closed_at: string | null;
      applicants: number;
      interviews: number;
      offers: number;
      note: string | null;
    }[]
  >`select id, title, dept, seats, status, opened_at, closed_at, applicants, interviews, offers, note
    from hr_vacancies order by (status = 'open') desc, opened_at desc limit 300`.catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    dept: r.dept,
    seats: r.seats,
    status: r.status,
    openedAt: new Date(r.opened_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    applicants: r.applicants,
    interviews: r.interviews,
    offers: r.offers,
    note: r.note,
  }));
}
