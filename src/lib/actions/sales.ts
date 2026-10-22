'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { sendToChat } from '@/lib/crm-bot';

// Operation HQ › Sales (2026-10-22): every write on a CRM lead from the
// kanban. Each one leaves a crm_lead_log row (who, what); the first touch
// (move, comment, message) stamps first_contact_at for the speed-to-lead clock.

type Result = { error?: string };
const uuid = z.string().uuid();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const phoneRe = /^[+\d][\d\s()-]{6,24}$/;
const last9 = (p: string) => p.replace(/\D/g, '').slice(-9);
const refresh = () => revalidatePath('/[locale]/operations', 'page');

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('operations.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

const log = (leadId: string, text: string, actor: string) => sql`insert into crm_lead_log (lead_id, text, actor) values (${leadId}, ${text}, ${actor})`;

async function courseId(name: string, by: string): Promise<string | null> {
  const n = name.trim();
  if (!n) return null;
  const [found] = await sql<{ id: string }[]>`select id from crm_courses where lower(name) = lower(${n}) and archived_at is null limit 1`;
  if (found) return found.id;
  const [made] = await sql<{ id: string }[]>`insert into crm_courses (name, created_by) values (${n}, ${by}) returning id`;
  return made.id;
}

async function firstStage(): Promise<string | null> {
  const [s] = await sql<{ id: string }[]>`
    select id from crm_lead_sections where archived_at is null and kind not in ('joined', 'lost') order by sort, created_at limit 1`;
  return s?.id ?? null;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const leadFields = {
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(phoneRe),
  age: z.coerce.number().int().min(1).max(99).nullable(),
  course: z.string().trim().max(120).default(''),
  groupId: uuid.nullable(),
};
const createSchema = z.object({ ...leadFields, source: z.enum(['insta', 'ref', 'walk', 'call', 'site', 'other']), force: z.boolean().default(false) });

/** Lid qo'shish. A phone already on an open lead returns `dup` unless `force`. */
export async function createLeadAction(input: z.input<typeof createSchema>): Promise<Result & { id?: string; dup?: { id: string; name: string } }> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = createSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (!v.force) {
      const [dup] = await sql<{ id: string; name: string }[]>`
        select id, coalesce(name, '') as name from crm_leads
        where archived_at is null and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 9) = ${last9(v.phone)} limit 1`;
      if (dup) return { dup };
    }
    const [section, course] = await Promise.all([firstStage(), courseId(v.course, me.id)]);
    const [row] = await sql<{ id: string }[]>`
      insert into crm_leads (section_id, name, phone, age, course_id, group_id, source, status, branch, owner_id, created_by, stage_at, first_contact_at)
      values (${section}, ${v.name}, ${v.phone}, ${v.age}, ${course}, ${v.groupId}, ${v.source}, 'open', 'persons_lc', ${me.id}, ${me.id}, now(), now())
      returning id`;
    await log(row.id, 'Lid qo‘shildi', me.id);
    refresh();
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

const updateSchema = z.object({
  id: uuid,
  ...leadFields,
  ownerId: uuid.nullable(),
  nextAction: z.string().trim().max(200).default(''),
  nextAt: dayKey.nullable(),
  trialDate: dayKey.nullable(),
  trialTime: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
});

export async function updateLeadAction(input: z.input<typeof updateSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = updateSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const course = await courseId(v.course, me.id);
    const res = await sql`
      update crm_leads set name = ${v.name}, phone = ${v.phone}, age = ${v.age}, course_id = ${course}, group_id = ${v.groupId},
        owner_id = ${v.ownerId}, next_action = ${v.nextAction || null}, next_at = ${v.nextAt},
        trial_date = ${v.trialDate}, trial_time = ${v.trialTime},
        trial_reminded_for = case when trial_date is distinct from ${v.trialDate}::date then null else trial_reminded_for end,
        updated_at = now()
      where id = ${v.id} and archived_at is null`;
    if (res.count === 0) return { error: 'notFound' };
    await log(v.id, 'Ma’lumotlar tahrirlandi', me.id);
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const moveSchema = z.object({ id: uuid, sectionId: uuid.nullable(), lostReason: z.string().trim().max(120).default('') });

/** Bosqichga o'tkazish (kanban). «Rad etdi» needs a reason; null = back to «Telegram» (bot leads only). */
export async function moveLeadAction(input: z.input<typeof moveSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = moveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const [lead] = await sql<{ source: string | null; section_id: string | null }[]>`
      select source, section_id from crm_leads where id = ${v.id} and archived_at is null`;
    if (!lead) return { error: 'notFound' };
    if (lead.section_id === v.sectionId) return {};
    let kind = 'telegram';
    let name = 'Telegram';
    if (v.sectionId) {
      const [s] = await sql<{ kind: string; name: string }[]>`select kind, name from crm_lead_sections where id = ${v.sectionId} and archived_at is null`;
      if (!s) return { error: 'notFound' };
      ({ kind, name } = s);
    } else if (lead.source !== 'telegram') return { error: 'invalidInput' };
    if (kind === 'lost' && !v.lostReason) return { error: 'reasonRequired' };
    const status = kind === 'joined' ? 'won' : kind === 'lost' ? 'lost' : 'open';
    await sql`
      update crm_leads set section_id = ${v.sectionId}, status = ${status}, stage_at = now(),
        lost_reason = ${kind === 'lost' ? v.lostReason : null}, first_contact_at = coalesce(first_contact_at, now()), updated_at = now()
      where id = ${v.id}`;
    await log(v.id, kind === 'lost' ? `«${name}» — sabab: ${v.lostReason}` : `«${name}» bosqichiga o‘tkazildi`, me.id);
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

/** O'chirish = arxivga (restorable). */
export async function archiveLeadAction(id: string): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`update crm_leads set archived_at = now(), archived_by = ${me.id}, updated_at = now() where id = ${id} and archived_at is null`;
    if (res.count === 0) return { error: 'notFound' };
    await log(id, 'Arxivga o‘tkazildi (o‘chirildi)', me.id);
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

export async function restoreLeadAction(id: string): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`update crm_leads set archived_at = null, archived_by = null, updated_at = now() where id = ${id} and archived_at is not null`;
    if (res.count === 0) return { error: 'notFound' };
    await log(id, 'Arxivdan qaytarildi', me.id);
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const convertSchema = z.object({ id: uuid, fee: z.coerce.number().int().min(0).max(100_000_000), start: dayKey });

/** O'quvchi qilish: a CRM student with the lead's phone (and Telegram), monthly fee and start date. */
export async function convertLeadAction(input: z.input<typeof convertSchema>): Promise<Result & { studentId?: string }> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = convertSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const studentId = await sql.begin(async (tx) => {
      const [lead] = await tx<{ name: string; phone: string; chat: number | null; username: string | null; student: string | null }[]>`
        select coalesce(name, '') as name, coalesce(phone, '') as phone, telegram_chat_id as chat, telegram_username as username,
          converted_student_id as student
        from crm_leads where id = ${v.id} and archived_at is null for update`;
      if (!lead) throw new Error('notFound');
      if (lead.student) return lead.student;
      const [s] = await tx<{ id: string }[]>`
        insert into crm_students (full_name, monthly_fee, billing_start, branch, created_by)
        values (${lead.name || lead.phone}, ${v.fee}, ${v.start}, 'persons_lc', ${me.id}) returning id`;
      if (lead.phone)
        await tx`insert into crm_contacts (student_id, kind, name, phone, telegram_chat_id, telegram_username, is_primary)
          values (${s.id}, 'student', ${lead.name}, ${lead.phone}, ${lead.chat}, ${lead.username}, true)`;
      const [joined] = await tx<{ id: string }[]>`
        select id from crm_lead_sections where kind = 'joined' and archived_at is null order by sort limit 1`;
      await tx`update crm_leads set converted_student_id = ${s.id}, status = 'won', section_id = coalesce(${joined?.id ?? null}, section_id),
        stage_at = now(), updated_at = now() where id = ${v.id}`;
      await tx`insert into crm_lead_log (lead_id, text, actor) values (${v.id}, 'O‘quvchiga aylantirildi', ${me.id})`;
      await tx`insert into crm_student_log (student_id, kind, text, actor)
        values (${s.id}, 'edit', ${`${lead.name} — Sales’dan o‘quvchi bo‘ldi`}, ${me.id})`;
      return s.id;
    });
    refresh();
    return { studentId };
  } catch (e) {
    return { error: e instanceof Error && e.message === 'notFound' ? 'notFound' : 'updateFailed' };
  }
}

// ---------------------------------------------------------------------------
// Card: comments, log, messages
// ---------------------------------------------------------------------------

export type LeadCard = {
  comments: { id: string; body: string; by: string; byId: string | null; at: string; editedAt: string | null; editedBy: string }[];
  log: { id: string; text: string; by: string; at: string }[];
  messages: { id: string; body: string; status: string; by: string; at: string }[];
};

export async function getLeadCardAction(id: string): Promise<{ card?: LeadCard; meId?: string; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const [comments, logRows, messages] = await Promise.all([
      sql<LeadCard['comments']>`
        select a.id, coalesce(a.body, '') as body, coalesce(p.first_name || ' ' || p.last_name, 'CRM') as by, a.created_by as "byId",
          a.created_at::text as at, a.updated_at::text as "editedAt", coalesce(u.first_name || ' ' || u.last_name, '') as "editedBy"
        from crm_lead_activities a left join profiles p on p.id = a.created_by left join profiles u on u.id = a.updated_by
        where a.lead_id = ${id} and a.kind = 'note' order by a.created_at desc`,
      sql<LeadCard['log']>`
        select l.id, l.text, coalesce(p.first_name || ' ' || p.last_name, 'Telegram bot') as by, l.created_at::text as at
        from crm_lead_log l left join profiles p on p.id = l.actor where l.lead_id = ${id} order by l.created_at desc limit 100`,
      sql<LeadCard['messages']>`
        select m.id, coalesce(m.body, '') as body, m.status, coalesce(p.first_name || ' ' || p.last_name, 'Avto') as by, m.created_at::text as at
        from crm_messages m left join profiles p on p.id = m.created_by where m.lead_id = ${id} order by m.created_at desc limit 50`,
    ]);
    return { card: { comments: [...comments], log: [...logRows], messages: [...messages] }, meId: profile.id };
  } catch {
    return { error: 'loadFailed' };
  }
}

const commentSchema = z.object({ leadId: uuid, body: z.string().trim().min(1).max(2000) });

export async function addLeadCommentAction(input: z.input<typeof commentSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = commentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`insert into crm_lead_activities (lead_id, kind, body, created_by) values (${p.data.leadId}, 'note', ${p.data.body}, ${me.id})`;
    await sql`update crm_leads set first_contact_at = coalesce(first_contact_at, now()) where id = ${p.data.leadId}`;
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const editCommentSchema = z.object({ id: uuid, body: z.string().trim().min(1).max(2000) });

/** Only the author edits their comment; the edit is stamped (who, when). */
export async function editLeadCommentAction(input: z.input<typeof editCommentSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = editCommentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update crm_lead_activities set body = ${p.data.body}, updated_at = now(), updated_by = ${me.id}
      where id = ${p.data.id} and kind = 'note' and created_by = ${me.id}`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

const leadMessageSchema = z.object({ leadId: uuid, body: z.string().trim().min(1).max(3000) });

/** Telegram xabar — only for leads linked to the CRM bot. */
export async function sendLeadMessageAction(input: z.input<typeof leadMessageSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = leadMessageSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const [lead] = await sql<{ chat: number | null }[]>`select telegram_chat_id as chat from crm_leads where id = ${v.leadId} and archived_at is null`;
    if (!lead) return { error: 'notFound' };
    if (lead.chat == null) return { error: 'noTelegram' };
    const ok = await sendToChat(Number(lead.chat), v.body);
    await sql`insert into crm_messages (lead_id, channel, direction, body, status, sent_at, created_by)
      values (${v.leadId}, 'telegram', 'out', ${v.body}, ${ok ? 'sent' : 'failed'}, now(), ${me.id})`;
    if (!ok) return { error: 'sendFailed' };
    await sql`update crm_leads set first_contact_at = coalesce(first_contact_at, now()) where id = ${v.leadId}`;
    await log(v.leadId, 'Telegram xabar yuborildi', me.id);
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Groups and stages
// ---------------------------------------------------------------------------

const groupsSchema = z
  .array(z.object({ id: uuid.nullable(), name: z.string().trim().min(1).max(60), color: z.enum(['g1', 'g2', 'g3', 'g4', 'g5', 'g6']) }))
  .max(40);

/** Lid guruhlari as edited: new ones added, missing ones deleted (their leads become ungrouped). */
export async function saveLeadGroupsAction(input: z.input<typeof groupsSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = groupsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      const keep = p.data.flatMap((g) => (g.id ? [g.id] : []));
      await tx`delete from crm_lead_groups where not (id = any(${keep}::uuid[]))`;
      for (const [i, g] of p.data.entries()) {
        if (g.id) await tx`update crm_lead_groups set name = ${g.name}, color = ${g.color}, sort = ${i} where id = ${g.id}`;
        else await tx`insert into crm_lead_groups (name, color, sort, created_by) values (${g.name}, ${g.color}, ${i}, ${me.id})`;
      }
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const stagesSchema = z.array(z.object({ id: uuid.nullable(), name: z.string().trim().min(1).max(60) })).min(1).max(20);

/**
 * Bosqichlar as edited, in order. A removed stage is archived and its open
 * leads move to the first stage; «O'quvchi bo'ldi» and «Rad etdi» stay.
 */
export async function saveStagesAction(input: z.input<typeof stagesSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = stagesSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      const keep = p.data.flatMap((s) => (s.id ? [s.id] : []));
      const gone = await tx<{ id: string }[]>`
        select id from crm_lead_sections where archived_at is null and kind not in ('joined', 'lost') and not (id = any(${keep}::uuid[]))`;
      for (const [i, s] of p.data.entries()) {
        if (s.id) await tx`update crm_lead_sections set name = ${s.name}, sort = ${(i + 1) * 10} where id = ${s.id}`;
        else await tx`insert into crm_lead_sections (name, sort, kind) values (${s.name}, ${(i + 1) * 10}, 'custom')`;
      }
      if (gone.length) {
        const ids = gone.map((g) => g.id);
        await tx`update crm_lead_sections set archived_at = now() where id = any(${ids}::uuid[])`;
        const [first] = await tx<{ id: string }[]>`
          select id from crm_lead_sections where archived_at is null and kind not in ('joined', 'lost') order by sort limit 1`;
        await tx`update crm_leads set section_id = ${first?.id ?? null}, stage_at = now() where section_id = any(${ids}::uuid[])`;
      }
      await tx`insert into crm_lead_log (lead_id, text, actor) values (null, ${`Bosqichlar yangilandi (${p.data.length} ta)`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Student notes (O'quvchilar card)
// ---------------------------------------------------------------------------

export type StudentNote = { id: string; body: string; by: string; byId: string | null; at: string; editedAt: string | null; editedBy: string };

export async function getStudentNotesAction(studentId: string): Promise<{ notes?: StudentNote[]; meId?: string; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const notes = await sql<StudentNote[]>`
      select n.id, n.body, coalesce(p.first_name || ' ' || p.last_name, '') as by, n.created_by as "byId", n.created_at::text as at,
        n.updated_at::text as "editedAt", coalesce(u.first_name || ' ' || u.last_name, '') as "editedBy"
      from crm_student_notes n left join profiles p on p.id = n.created_by left join profiles u on u.id = n.updated_by
      where n.student_id = ${studentId} order by n.created_at desc`;
    return { notes: [...notes], meId: profile.id };
  } catch {
    return { error: 'loadFailed' };
  }
}

const noteSchema = z.object({ studentId: uuid, body: z.string().trim().min(1).max(2000) });

export async function addStudentNoteAction(input: z.input<typeof noteSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = noteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`insert into crm_student_notes (student_id, body, created_by) values (${p.data.studentId}, ${p.data.body}, ${me.id})`;
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

const editNoteSchema = z.object({ id: uuid, body: z.string().trim().min(1).max(2000) });

export async function editStudentNoteAction(input: z.input<typeof editNoteSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = editNoteSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update crm_student_notes set body = ${p.data.body}, updated_at = now(), updated_by = ${me.id}
      where id = ${p.data.id} and created_by = ${me.id}`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

