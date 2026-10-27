'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { renderMessage, sendToStudentContacts, studentVars } from '@/lib/student-messages';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

// Operation HQ › O'quvchilar (2026-10-23): every write on a CRM student's
// billing goes through here and leaves a crm_student_log row (who, what).
// Money moves keep crm_students.balance in step in the same transaction.

type Result = { error?: string };
const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
const dmy = (k: string) => k.split('-').reverse().join('.');
const uuid = z.string().uuid();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.coerce.number().int().min(1).max(1_000_000_000);
const PAY_METHODS = ['cash', 'card', 'click', 'payme', 'uzum', 'transfer', 'other'] as const;

const refresh = () => revalidatePath('/[locale]/operations', 'page');

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('operations.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

async function nameOf(studentId: string): Promise<string | null> {
  const [s] = await sql<{ name: string }[]>`select full_name as name from crm_students where id = ${studentId}`;
  return s?.name ?? null;
}

// ---------------------------------------------------------------------------
// Read: one student's card
// ---------------------------------------------------------------------------

export type CardLedger = { id: string; type: 'charge' | 'pay'; date: string; amount: number; kind: string; note: string; actor: string; at: string };
export type StudentCard = {
  contacts: { kind: string; name: string; phone: string; tg: boolean }[];
  birthday: string | null;
  note: string;
  ledger: CardLedger[];
  messages: { id: string; title: string; body: string; sent: number; recipients: number; actor: string; at: string }[];
  log: { id: string; kind: string; text: string; actor: string; at: string }[];
  calls: { id: string; result: string; promised: string | null; note: string; actor: string; at: string }[];
};

export async function getStudentCardAction(studentId: string): Promise<{ card?: StudentCard; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const [[stu], contacts, ledger, messages, log, calls] = await Promise.all([
      sql<{ birthday: string | null; note: string }[]>`select birthday::text as birthday, note from crm_students where id = ${studentId}`,
      sql<StudentCard['contacts']>`
        select kind, coalesce(name, '') as name, coalesce(phone, '') as phone, telegram_chat_id is not null as tg
        from crm_contacts where student_id = ${studentId} order by (kind = 'student') desc, is_primary desc, created_at`,
      sql<CardLedger[]>`
        select * from (
          select c.id, 'charge' as type, c.due_date::text as date, c.amount, c.source as kind, coalesce(c.note, '') as note,
            coalesce(p.first_name || ' ' || p.last_name, case c.source when 'auto' then 'Avto-yechim' when 'import' then 'Import' else 'CRM' end) as actor,
            c.created_at::text as at
          from crm_charges c left join crm_enrollments e on e.id = c.enrollment_id left join profiles p on p.id = c.created_by
          where coalesce(c.student_id, e.student_id) = ${studentId}
          union all
          select y.id, 'pay', y.paid_at::text, case when y.is_refund then -y.amount else y.amount end, y.method, coalesce(y.note, ''),
            coalesce(p.first_name || ' ' || p.last_name, 'Import'), y.created_at::text
          from crm_payments y left join profiles p on p.id = y.created_by
          where y.student_id = ${studentId}
        ) x order by date desc, at desc limit 300`,
      sql<StudentCard['messages']>`
        select m.id, m.title, m.body, m.sent, m.recipients, coalesce(p.first_name || ' ' || p.last_name, 'Avto') as actor, m.created_at::text as at
        from crm_student_messages m left join profiles p on p.id = m.actor
        where m.student_id = ${studentId} order by m.created_at desc limit 100`,
      sql<StudentCard['log']>`
        select l.id, l.kind, l.text, coalesce(p.first_name || ' ' || p.last_name, 'Avto') as actor, l.created_at::text as at
        from crm_student_log l left join profiles p on p.id = l.actor
        where l.student_id = ${studentId} order by l.created_at desc limit 200`,
      sql<StudentCard['calls']>`
        select c.id, c.result, c.promised_date::text as promised, c.note, coalesce(p.first_name || ' ' || p.last_name, '') as actor, c.created_at::text as at
        from crm_debt_calls c left join profiles p on p.id = c.actor
        where c.student_id = ${studentId} order by c.created_at desc limit 50`,
    ]);
    if (!stu) return { error: 'notFound' };
    return { card: { contacts: [...contacts], birthday: stu.birthday, note: stu.note, ledger: [...ledger], messages: [...messages], log: [...log], calls: [...calls] } };
  } catch {
    return { error: 'loadFailed' };
  }
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  studentId: uuid,
  amount: money,
  method: z.enum(PAY_METHODS),
  paidAt: dayKey.optional(),
  note: z.string().trim().max(300).default(''),
  notify: z.boolean().default(false),
  idem: z.string().min(8).max(64),
});

/** How far back a forgotten payment may be dated. */
const PAY_BACKDATE_DAYS = 60;

/** To'lov qabul qilish; optionally sends the «paid» template to the parents (chek). */
export async function recordPaymentAction(input: z.input<typeof paymentSchema>): Promise<Result & { sent?: number }> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = paymentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const today = tashkentDayKey();
  const paidAt = v.paidAt ?? today;
  if (paidAt > today || paidAt < addDaysToKey(today, -PAY_BACKDATE_DAYS)) return { error: 'invalidInput' };
  const name = await nameOf(v.studentId);
  if (!name) return { error: 'notFound' };
  const late = paidAt === today ? '' : ` (${paidAt.split('-').reverse().join('.')} sanasi bilan)`;
  try {
    const ok = await sql.begin(async (tx) => {
      const [row] = await tx`
        insert into crm_payments (student_id, amount, method, paid_at, note, idem_key, created_by)
        values (${v.studentId}, ${v.amount}, ${v.method}, ${paidAt}, ${v.note || null}, ${v.idem}, ${me.id})
        on conflict (idem_key) do nothing returning id`;
      if (!row) return false;
      await tx`update crm_students set balance = balance + ${v.amount}, updated_at = now() where id = ${v.studentId}`;
      await tx`insert into crm_student_log (student_id, kind, text, amount, actor)
        values (${v.studentId}, 'pay', ${`${name} — ${som(v.amount)} to‘lov qabul qilindi${late}`}, ${v.amount}, ${me.id})`;
      return true;
    });
    if (!ok) return {};
  } catch {
    return { error: 'updateFailed' };
  }
  let sent: number | undefined;
  if (v.notify) {
    const [tpl] = await sql<{ id: string; name: string; body: string }[]>`
      select id, name, body from crm_message_templates where audience = 'student' and trigger = 'paid' order by sort limit 1`;
    const vars = tpl && (await studentVars(v.studentId, { tolandi: som(v.amount) }));
    if (tpl && vars) sent = (await deliver(v.studentId, tpl.id, tpl.name, renderMessage(tpl.body, vars), me.id, name)).sent;
  }
  refresh();
  return { sent };
}

const chargeSchema = z.object({ studentId: uuid, amount: money, reason: z.string().trim().min(1).max(200) });

/** Qo'lda yechish (minus): books, exam fee, correcting a wrong payment. */
export async function manualChargeAction(input: z.input<typeof chargeSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = chargeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const name = await nameOf(v.studentId);
  if (!name) return { error: 'notFound' };
  const today = tashkentDayKey();
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into crm_charges (student_id, period_start, period_end, amount, due_date, status, source, note, created_by)
        values (${v.studentId}, ${today}, ${today}, ${v.amount}, ${today}, 'pending', 'manual', ${v.reason}, ${me.id})`;
      await tx`update crm_students set balance = balance - ${v.amount}, updated_at = now() where id = ${v.studentId}`;
      await tx`insert into crm_student_log (student_id, kind, text, amount, actor)
        values (${v.studentId}, 'charge', ${`${name} — ${som(v.amount)} qo‘lda yechildi (${v.reason})`}, ${v.amount}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Billing terms, freeze, archive
// ---------------------------------------------------------------------------

const termsSchema = z.object({
  studentId: uuid,
  /** null = follow the active enrollments' tariffs */
  fee: z.coerce.number().int().min(0).max(100_000_000).nullable(),
  start: dayKey.nullable(),
  discountPct: z.coerce.number().int().min(0).max(100),
  discountReason: z.string().trim().max(200).default(''),
  installments: z.union([z.literal(1), z.literal(2)]),
});

/** Oylik summa, aktiv sana (to'lov kuni), chegirma, bo'lib to'lash. From the next charge on. */
export async function updateStudentTermsAction(input: z.input<typeof termsSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = termsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const [old] = await sql<{ name: string; fee: number | null; start: string | null; discount: number; installments: number }[]>`
      select full_name as name, monthly_fee as fee, billing_start::text as start, discount_pct as discount, installments
      from crm_students where id = ${v.studentId} and archived_at is null`;
    if (!old) return { error: 'notFound' };
    const changes: string[] = [];
    if (old.fee !== v.fee) changes.push(`oylik ${old.fee == null ? 'tarifdan' : formatUZS(old.fee)} → ${v.fee == null ? 'tarifdan' : formatUZS(v.fee)}`);
    if (old.start !== v.start) changes.push(`aktiv sana ${old.start ? dmy(old.start) : '—'} → ${v.start ? dmy(v.start) : '—'}`);
    if (old.discount !== v.discountPct) changes.push(`chegirma ${old.discount}% → ${v.discountPct}%${v.discountReason ? ` (${v.discountReason})` : ''}`);
    if (old.installments !== v.installments) changes.push(v.installments === 2 ? 'bo‘lib to‘lash yoqildi' : 'bo‘lib to‘lash o‘chirildi');
    if (!changes.length) return {};
    await sql.begin(async (tx) => {
      await tx`
        update crm_students set monthly_fee = ${v.fee}, billing_start = ${v.start}, discount_pct = ${v.discountPct},
          discount_reason = ${v.discountReason || null}, installments = ${v.installments}, updated_at = now()
        where id = ${v.studentId}`;
      await tx`insert into crm_student_log (student_id, kind, text, actor) values (${v.studentId}, 'edit', ${`${old.name} — ${changes.join(', ')}`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const paidElsewhereSchema = z.object({
  studentIds: z.array(uuid).min(1).max(500),
  source: z.string().trim().min(1).max(60),
  note: z.string().trim().max(300).default(''),
  /** Oylik summa for the students that have none yet; required when any of them has none. */
  fee: money.nullable().default(null),
});

/**
 * Qo'lda faol: the students paid in another CRM, so they count as having paid
 * (faol) without a payment here — nothing goes to the kassa or the balance.
 */
export async function markPaidElsewhereAction(input: z.input<typeof paidElsewhereSchema>): Promise<Result & { done?: number }> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = paidElsewhereSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const tail = `qo‘lda faol qilindi (${v.source}${v.note ? `, ${v.note}` : ''})`;
  try {
    const list = await sql<{ id: string; name: string; fee: number }[]>`
      select s.id, s.full_name as name,
        coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) as fee
      from crm_students s
      where s.id = any(${v.studentIds}) and s.archived_at is null and s.status = 'active' and s.paid_elsewhere_at is null`;
    if (!list.length) return { error: 'notFound' };
    if (!v.fee && list.some((s) => s.fee <= 0)) return { error: 'feeRequired' };
    await sql.begin(async (tx) => {
      for (const s of list) {
        const setFee = s.fee <= 0 && v.fee ? v.fee : null;
        await tx`
          update crm_students set paid_elsewhere_at = now(), paid_elsewhere_source = ${v.source}, paid_elsewhere_by = ${me.id},
            monthly_fee = coalesce(${setFee}::bigint, monthly_fee), updated_at = now()
          where id = ${s.id}`;
        await tx`insert into crm_student_log (student_id, kind, text, actor)
          values (${s.id}, 'edit', ${`${s.name} — ${tail}${setFee ? `, oylik ${formatUZS(setFee)}` : ''}`}, ${me.id})`;
      }
    });
    refresh();
    return { done: list.length };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function unmarkPaidElsewhereAction(studentId: string): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const name = await nameOf(studentId);
    if (!name) return { error: 'notFound' };
    await sql.begin(async (tx) => {
      const res = await tx`
        update crm_students set paid_elsewhere_at = null, paid_elsewhere_source = null, paid_elsewhere_by = null, updated_at = now()
        where id = ${studentId} and paid_elsewhere_at is not null`;
      if (res.count === 0) throw new Error('notFound');
      await tx`insert into crm_student_log (student_id, kind, text, actor) values (${studentId}, 'edit', ${`${name} — qo‘lda faollik bekor qilindi`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const freezeSchema = z.object({ studentId: uuid, until: dayKey.nullable() });

/** Muzlatish until a date (no charges meanwhile); `until: null` unfreezes now. */
export async function freezeStudentAction(input: z.input<typeof freezeSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = freezeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  if (v.until && v.until < tashkentDayKey()) return { error: 'invalidInput' };
  try {
    const name = await nameOf(v.studentId);
    if (!name) return { error: 'notFound' };
    await sql.begin(async (tx) => {
      const res = await tx`
        update crm_students set status = ${v.until ? 'frozen' : 'active'}, frozen_until = ${v.until}, updated_at = now()
        where id = ${v.studentId} and archived_at is null`;
      if (res.count === 0) throw new Error('notFound');
      await tx`insert into crm_student_log (student_id, kind, text, actor)
        values (${v.studentId}, 'freeze', ${v.until ? `${name} — ${dmy(v.until)} gacha muzlatildi` : `${name} — muzlatish bekor qilindi`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const archiveSchema = z.object({ studentId: uuid, reason: z.string().trim().min(1).max(120), note: z.string().trim().max(500).default('') });

/** Chiqarish: the student goes to the archive with a reason (counted in the exit statistics). */
export async function archiveStudentAction(input: z.input<typeof archiveSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = archiveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const name = await nameOf(v.studentId);
    if (!name) return { error: 'notFound' };
    const done = await sql.begin(async (tx) => {
      const res = await tx`
        update crm_students set archived_at = now(), status = 'archived', leave_reason = ${v.reason}, leave_note = ${v.note || null},
          archived_by = ${me.id}, updated_at = now()
        where id = ${v.studentId} and archived_at is null`;
      if (res.count === 0) return false;
      await tx`insert into crm_student_log (student_id, kind, text, actor)
        values (${v.studentId}, 'archive', ${`${name} — chiqarildi: «${v.reason}»${v.note ? ` (${v.note})` : ''}`}, ${me.id})`;
      return true;
    });
    if (!done) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

export async function restoreStudentAction(studentId: string): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const name = await nameOf(studentId);
    if (!name) return { error: 'notFound' };
    const done = await sql.begin(async (tx) => {
      const res = await tx`
        update crm_students set archived_at = null, status = 'active', archived_by = null, updated_at = now()
        where id = ${studentId} and archived_at is not null`;
      if (res.count === 0) return false;
      await tx`insert into crm_student_log (student_id, kind, text, actor) values (${studentId}, 'restore', ${`${name} — arxivdan qaytarildi`}, ${me.id})`;
      return true;
    });
    if (!done) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const infoSchema = z.object({
  studentId: uuid,
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).default(''),
  parentName: z.string().trim().max(120).default(''),
  parentPhone: z.string().trim().max(30).default(''),
});

/**
 * Tahrirlash: name, the student's phone and the main parent. Contacts are
 * updated in place so a parent's Telegram link survives a phone fix.
 */
export async function updateStudentInfoAction(input: z.input<typeof infoSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = infoSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const done = await sql.begin(async (tx) => {
      const [old] = await tx<{ name: string }[]>`select full_name as name from crm_students where id = ${v.studentId} for update`;
      if (!old) return false;
      const changes: string[] = [];
      if (old.name !== v.name) {
        await tx`update crm_students set full_name = ${v.name}, updated_at = now() where id = ${v.studentId}`;
        changes.push(`ism «${old.name}» → «${v.name}»`);
      }
      const [own] = await tx<{ id: string; phone: string | null }[]>`
        select id, phone from crm_contacts where student_id = ${v.studentId} and kind = 'student' order by is_primary desc, created_at limit 1`;
      if ((own?.phone ?? '') !== v.phone) {
        if (own) await tx`update crm_contacts set phone = ${v.phone || null} where id = ${own.id}`;
        else if (v.phone) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${v.studentId}, 'student', ${v.phone}, true)`;
        changes.push(`telefon ${own?.phone || '—'} → ${v.phone || '—'}`);
      }
      const [par] = await tx<{ id: string; name: string | null; phone: string | null }[]>`
        select id, name, phone from crm_contacts where student_id = ${v.studentId} and kind <> 'student' order by is_primary desc, created_at limit 1`;
      if ((par?.name ?? '') !== v.parentName || (par?.phone ?? '') !== v.parentPhone) {
        if (par) await tx`update crm_contacts set name = ${v.parentName || null}, phone = ${v.parentPhone || null} where id = ${par.id}`;
        else if (v.parentName || v.parentPhone)
          await tx`insert into crm_contacts (student_id, kind, name, phone, is_primary) values (${v.studentId}, 'guardian', ${v.parentName || null}, ${v.parentPhone || null}, true)`;
        changes.push(`ota-ona ${[par?.name, par?.phone].filter(Boolean).join(' ') || '—'} → ${[v.parentName, v.parentPhone].filter(Boolean).join(' ') || '—'}`);
      }
      if (changes.length)
        await tx`insert into crm_student_log (student_id, kind, text, actor) values (${v.studentId}, 'edit', ${`${v.name} — ${changes.join(', ')}`}, ${me.id})`;
      return true;
    });
    if (!done) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

/**
 * O'chirish: removes the student with contacts, enrollments, charges, notes
 * and messages. A student with any payment is refused (`hasPayments`) — the
 * cash and finance reports need those rows; archive them instead.
 */
export async function deleteStudentAction(studentId: string): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  try {
    const res = await sql.begin(async (tx) => {
      const [s] = await tx<{ name: string }[]>`select full_name as name from crm_students where id = ${studentId} for update`;
      if (!s) return 'notFound';
      const [paid] = await tx`select 1 from crm_payments where student_id = ${studentId} limit 1`;
      if (paid) return 'hasPayments';
      await tx`delete from crm_students where id = ${studentId}`;
      await tx`insert into crm_student_log (student_id, kind, text, actor) values (null, 'archive', ${`${s.name} — butunlay o‘chirildi`}, ${me.id})`;
      return null;
    });
    if (res) return { error: res };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Messages and calls
// ---------------------------------------------------------------------------

async function deliver(studentId: string, templateId: string | null, title: string, text: string, actor: string, name: string) {
  const r = await sendToStudentContacts(studentId, text);
  await sql`
    insert into crm_student_messages (student_id, template_id, title, trigger, body, recipients, sent, actor)
    values (${studentId}, ${templateId}, ${title}, 'none', ${text}, ${r.recipients}, ${r.sent}, ${actor})`;
  if (r.sent) await sql`insert into crm_student_log (student_id, kind, text, actor) values (${studentId}, 'msg', ${`${name} ota-onasiga «${title}» yuborildi`}, ${actor})`;
  return r;
}

const messageSchema = z.object({ studentId: uuid, templateId: uuid.nullable(), title: z.string().trim().max(120).default(''), body: z.string().trim().min(1).max(3000) });

/** Qo'lda xabar: the edited text goes to every linked parent through the CRM bot. */
export async function sendStudentMessageAction(input: z.input<typeof messageSchema>): Promise<Result & { sent?: number; recipients?: number }> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = messageSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const name = await nameOf(v.studentId);
  if (!name) return { error: 'notFound' };
  try {
    const r = await deliver(v.studentId, v.templateId, v.title || 'Xabar', v.body, me.id, name);
    if (r.recipients === 0) return { error: 'noTelegram' };
    if (r.sent === 0) return { error: 'sendFailed' };
    refresh();
    return r;
  } catch {
    return { error: 'updateFailed' };
  }
}

/** Fills a template for one student (preview before sending). */
export async function previewTemplateAction(studentId: string, body: string): Promise<{ text?: string; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  if (!uuid.safeParse(studentId).success) return { error: 'invalidInput' };
  const vars = await studentVars(studentId);
  return vars ? { text: renderMessage(body.slice(0, 3000), vars) } : { error: 'notFound' };
}

const callSchema = z.object({
  studentId: uuid,
  result: z.enum(['promised', 'no_answer', 'refused', 'other']),
  promisedDate: dayKey.nullable(),
  note: z.string().trim().max(500).default(''),
});
const CALL_UZ = { promised: 'to‘lashga va’da berdi', no_answer: 'javob bermadi', refused: 'to‘lamaydi', other: 'boshqa' } as const;

/** Qarzdorga qo'ng'iroq natijasi. */
export async function logDebtCallAction(input: z.input<typeof callSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = callSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const name = await nameOf(v.studentId);
  if (!name) return { error: 'notFound' };
  try {
    await sql.begin(async (tx) => {
      await tx`insert into crm_debt_calls (student_id, result, promised_date, note, actor)
        values (${v.studentId}, ${v.result}, ${v.promisedDate}, ${v.note}, ${me.id})`;
      await tx`insert into crm_student_log (student_id, kind, text, actor)
        values (${v.studentId}, 'call', ${`${name} — qo‘ng‘iroq: ${CALL_UZ[v.result]}${v.promisedDate ? ` (${dmy(v.promisedDate)})` : ''}${v.note ? ` · ${v.note}` : ''}`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

// ---------------------------------------------------------------------------
// Templates and settings
// ---------------------------------------------------------------------------

const templatesSchema = z.object({
  audience: z.enum(['student', 'lead']).default('student'),
  list: z
    .array(
    z.object({
      id: uuid.nullable(),
      name: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(3000),
      trigger: z.enum(['before', 'due', 'paid', 'none']),
    }),
    )
    .max(40),
});

/** Xabar shablonlari (o'quvchi yoki lid): the list as edited — new rows added, missing rows deleted. */
export async function saveTemplatesAction(input: z.input<typeof templatesSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = templatesSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { audience, list } = p.data;
  try {
    await sql.begin(async (tx) => {
      const keep = list.flatMap((t) => (t.id ? [t.id] : []));
      await tx`delete from crm_message_templates where audience = ${audience} and not (id = any(${keep}::uuid[]))`;
      for (const [i, t] of list.entries()) {
        if (t.id)
          await tx`update crm_message_templates set name = ${t.name}, body = ${t.body}, trigger = ${t.trigger}, sort = ${i},
            updated_by = ${me.id}, updated_at = now() where id = ${t.id} and audience = ${audience}`;
        else
          await tx`insert into crm_message_templates (name, body, trigger, sort, audience, updated_by)
            values (${t.name}, ${t.body}, ${t.trigger}, ${i}, ${audience}, ${me.id})`;
      }
      await tx`insert into crm_student_log (kind, text, actor) values ('settings', ${`${audience === 'lead' ? 'Lid' : 'O‘quvchi'} xabar shablonlari yangilandi (${list.length} ta)`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  startDate: dayKey,
  remindDays: z.coerce.number().int().min(0).max(10),
  payLink: z.string().trim().max(300).default(''),
  callAfterDays: z.coerce.number().int().min(1).max(60),
});

/** Avto-yechim: on/off, from which date, reminder lead time, payment link, call list threshold. */
export async function saveBillingSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into crm_billing_settings (id, enabled, start_date, remind_days, pay_link, call_after_days, updated_by, updated_at)
        values (true, ${v.enabled}, ${v.startDate}, ${v.remindDays}, ${v.payLink}, ${v.callAfterDays}, ${me.id}, now())
        on conflict (id) do update set enabled = excluded.enabled, start_date = excluded.start_date, remind_days = excluded.remind_days,
          pay_link = excluded.pay_link, call_after_days = excluded.call_after_days, updated_by = excluded.updated_by, updated_at = now()`;
      await tx`insert into crm_student_log (kind, text, actor)
        values ('settings', ${`Avto-yechim ${v.enabled ? 'yoqildi' : 'o‘chirildi'} · ${dmy(v.startDate)} dan · ${v.remindDays} kun oldin eslatma`}, ${me.id})`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}
