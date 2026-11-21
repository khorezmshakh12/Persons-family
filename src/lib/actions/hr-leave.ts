'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { CAP_ROLES, can, canFor } from '@/lib/permissions';
import { notifyUsers } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { LEAVE_KINDS, LEAVE_KIND_LABEL, fmtDayKey, leaveDays } from '@/lib/hr-leave';

// HR › Ta'til va Ishga olish. Har bir amal o'z autentifikatsiyasini tekshiradi.
// Holat o'tishlari `where status = …` bilan — 0 qator = kimdir allaqachon
// qaror qilgan, keyingi xabarlar yuborilmaydi.

type Result = { error: string } | { ok: true };

const uuid = z.string().uuid();
const day = z.iso.date();
const revalidate = () => {
  revalidatePath('/[locale]/hr', 'page');
  revalidatePath('/[locale]/calendar', 'page');
};
const nameOf = (p: { first_name?: string | null; last_name?: string | null }) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
const span = (a: string, b: string) => `${fmtDayKey(a)} – ${fmtDayKey(b)} · ${leaveDays(a, b)} kun`;

/** Everyone who decides leave (by role, incl. extra positions). */
async function reviewers(): Promise<string[]> {
  const roles = [...CAP_ROLES['leave.review']];
  const rows = await sql<{ id: string }[]>`
    select distinct p.id from profiles p left join profile_roles r on r.user_id = p.id
    where p.is_active and (p.role::text in ${sql(roles)} or r.role::text in ${sql(roles)})`.catch(() => []);
  return rows.map((r) => r.id);
}

const requestSchema = z.object({
  kind: z.enum(LEAVE_KINDS),
  from: day,
  to: day,
  reason: z.string().trim().max(300).optional(),
});

/** Employee: «Ta'til so'rash». Up to 60 days back (sick leave is often
 * reported later), at most 90 days long, no overlap with own open leave. */
export async function requestLeaveAction(input: z.input<typeof requestSchema>): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const p = requestSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { kind, from, to, reason } = p.data;
  if (to < from) return { error: 'badRange' };
  if (from < addDaysToKey(tashkentDayKey(), -60)) return { error: 'tooOld' };
  if (leaveDays(from, to) > 90) return { error: 'tooLong' };
  try {
    const err = await sql.begin(async (t) => {
      await t`select pg_advisory_xact_lock(hashtext(${'leave:' + user.id}))`;
      const [clash] = await t`
        select 1 from leave_requests where user_id = ${user.id} and status in ('pending', 'approved')
          and from_day <= ${to} and to_day >= ${from} limit 1`;
      if (clash) return 'overlap';
      await t`insert into leave_requests (user_id, kind, from_day, to_day, reason)
        values (${user.id}, ${kind}, ${from}, ${to}, ${reason || null})`;
      return null;
    });
    if (err) return { error: err };
  } catch (e) {
    console.error('[hr-leave] request failed', e);
    return { error: 'failed' };
  }
  const to_ = (await reviewers()).filter((id) => id !== user.id);
  await notifyUsers('task', to_, `🌴 <b>${nameOf(profile)}</b> — ${LEAVE_KIND_LABEL[kind].toLowerCase()} so‘radi (${span(from, to)})`, {
    href: '/hr?tab=leave',
  }).catch(() => {});
  revalidate();
  return { ok: true };
}

/** Employee: take back a pending request, or cancel approved leave that has
 * not started yet. */
export async function cancelLeaveAction(id: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const today = tashkentDayKey();
  try {
    const [row] = await sql<{ status: string; kind: keyof typeof LEAVE_KIND_LABEL; from_day: string; to_day: string }[]>`
      update leave_requests l set status = 'cancelled'
      from (select status as old from leave_requests where id = ${id}) o
      where l.id = ${id} and l.user_id = ${user.id}
        and (l.status = 'pending' or (l.status = 'approved' and l.from_day > ${today}))
      returning o.old as status, l.kind, l.from_day::text as from_day, l.to_day::text as to_day`;
    if (!row) return { error: 'locked' };
    if (row.status === 'approved') {
      await notifyUsers('task', await reviewers(), `↩️ ${nameOf(profile)} tasdiqlangan ${LEAVE_KIND_LABEL[row.kind].toLowerCase()}ni bekor qildi (${span(row.from_day, row.to_day)})`, {
        href: '/hr?tab=leave',
      }).catch(() => {});
    }
  } catch (e) {
    console.error('[hr-leave] cancel failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}

const decideSchema = z.object({ id: uuid, approve: z.boolean(), note: z.string().trim().max(300).optional() });

/** CEO / COO / HR: approve, or reject with a reason. Not one's own request
 * (except the CEO, who has nobody above). */
export async function decideLeaveAction(input: z.input<typeof decideSchema>): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!canFor(profile, 'leave.review')) return { error: 'forbidden' };
  const p = decideSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, approve, note } = p.data;
  if (!approve && !note) return { error: 'noteRequired' };
  try {
    const [row] = await sql<{ user_id: string; kind: keyof typeof LEAVE_KIND_LABEL; from_day: string; to_day: string }[]>`
      update leave_requests set status = ${approve ? 'approved' : 'rejected'}, decided_by = ${user.id}, decided_at = now(),
        decision_note = ${note || null}
      where id = ${id} and status = 'pending' and (user_id <> ${user.id} or ${can(profile.role, 'company.overview')})
      returning user_id, kind, from_day::text as from_day, to_day::text as to_day`;
    if (!row) return { error: 'alreadyDecided' };
    await notifyUsers(
      'task',
      [row.user_id],
      approve
        ? `✅ ${LEAVE_KIND_LABEL[row.kind]} so‘rovingiz tasdiqlandi (${span(row.from_day, row.to_day)})${note ? `: ${note}` : ''}`
        : `❌ ${LEAVE_KIND_LABEL[row.kind]} so‘rovingiz rad etildi (${span(row.from_day, row.to_day)}): ${note}`,
      { href: '/hr?tab=leave' },
    ).catch(() => {});
  } catch (e) {
    console.error('[hr-leave] decide failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}

/** Undo a decision — the request is pending again (the employee is told). */
export async function reopenLeaveAction(id: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!canFor(profile, 'leave.review')) return { error: 'forbidden' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ user_id: string; kind: keyof typeof LEAVE_KIND_LABEL; from_day: string; to_day: string }[]>`
      update leave_requests set status = 'pending', decided_by = null, decided_at = null, decision_note = null
      where id = ${id} and status in ('approved', 'rejected')
      returning user_id, kind, from_day::text as from_day, to_day::text as to_day`;
    if (!row) return { error: 'locked' };
    await notifyUsers('task', [row.user_id], `↩️ ${LEAVE_KIND_LABEL[row.kind]} so‘rovingiz bo‘yicha qaror bekor qilindi — qayta ko‘rib chiqiladi (${span(row.from_day, row.to_day)})`, {
      href: '/hr?tab=leave',
    }).catch(() => {});
  } catch (e) {
    console.error('[hr-leave] reopen failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}

/* ------------------------------------------------------------ hiring */

const DEPTS = ['top', 'acad', 'com', 'ops', 'fin', 'hr'] as const;
const count = z.number().int().min(0).max(9999);
const vacancySchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1).max(120),
  dept: z.enum(DEPTS),
  seats: z.number().int().min(1).max(99),
  applicants: count.default(0),
  interviews: count.default(0),
  offers: count.default(0),
  note: z.string().trim().max(500).optional(),
});

async function requireHiring() {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' as const };
  if (!canFor(profile, 'hr.hiring')) return { error: 'forbidden' as const };
  return { user };
}

/** Create (no id) or edit a vacancy, incl. its candidate counts. */
export async function saveVacancyAction(input: z.input<typeof vacancySchema>): Promise<Result> {
  const a = await requireHiring();
  if (a.error !== undefined) return { error: a.error };
  const p = vacancySchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const res = await sql`
        update hr_vacancies set title = ${v.title}, dept = ${v.dept}, seats = ${v.seats}, applicants = ${v.applicants},
          interviews = ${v.interviews}, offers = ${v.offers}, note = ${v.note || null}
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into hr_vacancies (title, dept, seats, applicants, interviews, offers, note, created_by)
        values (${v.title}, ${v.dept}, ${v.seats}, ${v.applicants}, ${v.interviews}, ${v.offers}, ${v.note || null}, ${a.user.id})`;
    }
  } catch (e) {
    console.error('[hr-hiring] save failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}

/** Close (filled / cancelled) or reopen a vacancy. */
export async function setVacancyOpenAction(id: string, open: boolean): Promise<Result> {
  const a = await requireHiring();
  if (a.error !== undefined) return { error: a.error };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update hr_vacancies set status = ${open ? 'open' : 'closed'}, closed_at = ${open ? null : sql`now()`}
      where id = ${id} and status = ${open ? 'closed' : 'open'}`;
    if (res.count === 0) return { error: 'locked' };
  } catch (e) {
    console.error('[hr-hiring] open/close failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}

/** Delete a vacancy opened by mistake (the UI asks first). */
export async function deleteVacancyAction(id: string): Promise<Result> {
  const a = await requireHiring();
  if (a.error !== undefined) return { error: a.error };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from hr_vacancies where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch (e) {
    console.error('[hr-hiring] delete failed', e);
    return { error: 'failed' };
  }
  revalidate();
  return { ok: true };
}
