'use server';

import { z } from 'zod';
import type { TransactionSql } from 'postgres';
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
const PAY_LABEL: Record<string, string> = { cash: 'Naqd', card: 'Karta', click: 'Click', payme: 'Payme', uzum: 'Uzum', transfer: 'O‘tkazma', online: 'Onlayn', other: 'Boshqa' };

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

export type CardLedger = {
  id: string;
  type: 'charge' | 'pay';
  date: string;
  amount: number;
  kind: string;
  note: string;
  actor: string;
  at: string;
  /** Payments only: the last correction ("Naqd → Click · Umida T.") and whether it was cancelled. */
  edit: string | null;
  cancelled: boolean;
  isCancel: boolean;
};
/** Key dates of the student's path, oldest first. */
export type CardDates = {
  lead: { at: string; source: string } | null;
  created: { at: string; by: string };
  groups: { name: string; since: string; status: string }[];
  /** First real payment, or the «paid in another CRM» mark. */
  active: { at: string; how: string } | null;
};
export type StudentCard = {
  contacts: { kind: string; name: string; phone: string; tg: boolean; tgUsername: string }[];
  /** The student's own Telegram username, else one from a contact or the lead. */
  tgUsername: string;
  dates: CardDates;
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
    const [[stu], contacts, ledger, messages, log, calls, [lead], groups, [first]] = await Promise.all([
      sql<{ birthday: string | null; note: string; created: string; by: string; pe_at: string | null; pe_source: string | null }[]>`
        select s.birthday::text as birthday, s.note, (s.created_at at time zone 'Asia/Tashkent')::date::text as created,
          coalesce(p.first_name || ' ' || p.last_name, 'Import') as by,
          (s.paid_elsewhere_at at time zone 'Asia/Tashkent')::date::text as pe_at, s.paid_elsewhere_source as pe_source
        from crm_students s left join profiles p on p.id = s.created_by where s.id = ${studentId}`,
      sql<StudentCard['contacts']>`
        select kind, coalesce(name, '') as name, coalesce(phone, '') as phone, telegram_chat_id is not null as tg,
          coalesce(telegram_username, '') as "tgUsername"
        from crm_contacts where student_id = ${studentId} order by (kind = 'student') desc, is_primary desc, created_at`,
      sql<CardLedger[]>`
        select * from (
          select c.id, 'charge' as type, c.due_date::text as date, c.amount, c.source as kind, coalesce(c.note, '') as note,
            coalesce(p.first_name || ' ' || p.last_name, case c.source when 'auto' then 'Avto-yechim' when 'import' then 'Import' else 'CRM' end) as actor,
            c.created_at::text as at, null as edit, false as cancelled, false as "isCancel"
          from crm_charges c left join crm_enrollments e on e.id = c.enrollment_id left join profiles p on p.id = c.created_by
          where coalesce(c.student_id, e.student_id) = ${studentId}
          union all
          select y.id, 'pay', y.paid_at::text, case when y.is_refund then -y.amount else y.amount end, y.method, coalesce(y.note, ''),
            coalesce(p.first_name || ' ' || p.last_name, 'Import'), y.created_at::text,
            y.edit_note, exists (select 1 from crm_payments r where r.reverses = y.id), y.reverses is not null
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
      sql<{ at: string; source: string; tgu: string | null }[]>`
        select (created_at at time zone 'Asia/Tashkent')::date::text as at, coalesce(nullif(source, ''), 'Lid') as source, telegram_username as tgu
        from crm_leads where converted_student_id = ${studentId} order by created_at limit 1`,
      sql<CardDates['groups']>`
        select g.name, e.activation_date::text as since, e.status
        from crm_enrollments e join crm_groups g on g.id = e.group_id
        where e.student_id = ${studentId} order by e.activation_date`,
      sql<{ at: string; amount: number; method: string }[]>`
        select paid_at::text as at, amount, method from crm_payments
        where student_id = ${studentId} and not is_refund and amount > 0 and reverses is null
          and not exists (select 1 from crm_payments r where r.reverses = crm_payments.id)
        order by paid_at, created_at limit 1`,
    ]);
    if (!stu) return { error: 'notFound' };
    const active =
      first && (!stu.pe_at || first.at <= stu.pe_at)
        ? { at: first.at, how: `birinchi to‘lov ${som(first.amount)} (${PAY_LABEL[first.method] ?? first.method})` }
        : stu.pe_at
          ? { at: stu.pe_at, how: `boshqa CRM’da to‘lagan${stu.pe_source ? ` · ${stu.pe_source}` : ''}` }
          : null;
    const tgUsername = contacts.find((c) => c.kind === 'student' && c.tgUsername)?.tgUsername || contacts.find((c) => c.tgUsername)?.tgUsername || lead?.tgu || '';
    return {
      card: {
        contacts: [...contacts],
        tgUsername,
        dates: { lead: lead ? { at: lead.at, source: lead.source } : null, created: { at: stu.created, by: stu.by }, groups: [...groups], active },
        birthday: stu.birthday,
        note: stu.note,
        ledger: [...ledger],
        messages: [...messages],
        log: [...log],
        calls: [...calls],
      },
    };
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

const payEditSchema = z.object({
  paymentId: uuid,
  method: z.enum(PAY_METHODS),
  amount: money,
  paidAt: dayKey,
  reason: z.string().trim().min(3).max(300),
});

/** How far back a corrected payment date may go. */
const PAY_EDIT_DAYS = 400;

/**
 * To'lovni tahrirlash: method (Naqd → Click), amount or date of a payment
 * already recorded. The balance moves by the difference; the row keeps who
 * changed it last and the log keeps every old → new. A refund or a cancelled
 * payment cannot be edited.
 */
export async function updatePaymentAction(input: z.input<typeof payEditSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = payEditSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const today = tashkentDayKey();
  if (v.paidAt > today || v.paidAt < addDaysToKey(today, -PAY_EDIT_DAYS)) return { error: 'invalidInput' };
  try {
    const res = await sql.begin(async (tx) => {
      const [old] = await tx<{ student_id: string | null; amount: number; method: string; paid_at: string; is_refund: boolean; reverses: string | null; name: string; cancelled: boolean }[]>`
        select y.student_id, y.amount, y.method, y.paid_at::text as paid_at, y.is_refund, y.reverses, coalesce(s.full_name, '') as name,
          exists (select 1 from crm_payments r where r.reverses = y.id) as cancelled
        from crm_payments y left join crm_students s on s.id = y.student_id where y.id = ${v.paymentId} for update of y`;
      if (!old || !old.student_id) return 'notFound';
      if (old.is_refund || old.reverses || old.cancelled) return 'locked';
      const changes: string[] = [];
      if (old.method !== v.method) changes.push(`${PAY_LABEL[old.method] ?? old.method} → ${PAY_LABEL[v.method]}`);
      if (old.amount !== v.amount) changes.push(`${som(old.amount)} → ${som(v.amount)}`);
      if (old.paid_at !== v.paidAt) changes.push(`${dmy(old.paid_at)} → ${dmy(v.paidAt)}`);
      if (!changes.length) return 'same';
      const summary = changes.join(', ');
      await tx`update crm_payments set method = ${v.method}, amount = ${v.amount}, paid_at = ${v.paidAt},
        edited_at = now(), edited_by = ${me.id}, edit_note = ${`${summary} · ${v.reason}`} where id = ${v.paymentId}`;
      if (old.amount !== v.amount)
        await tx`update crm_students set balance = balance + ${v.amount - old.amount}, updated_at = now() where id = ${old.student_id}`;
      await tx`insert into crm_student_log (student_id, kind, text, amount, actor)
        values (${old.student_id}, 'payedit', ${`${old.name} — to‘lov tahrirlandi: ${summary}. Sabab: ${v.reason}`}, ${v.amount - old.amount}, ${me.id})`;
      return 'ok';
    });
    if (res === 'notFound') return { error: 'notFound' };
    if (res === 'locked') return { error: 'paymentLocked' };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

const payCancelSchema = z.object({ paymentId: uuid, reason: z.string().trim().min(3).max(300) });

/**
 * To'lovni bekor qilish: nothing is deleted. A refund row (`reverses`) takes
 * the amount back out today, so cash, stats and the balance all net it, and
 * the original stays in the history marked «bekor qilingan».
 */
export async function cancelPaymentAction(input: z.input<typeof payCancelSchema>): Promise<Result> {
  const me = await requireEditor();
  if ('error' in me) return me;
  const p = payCancelSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const res = await sql.begin(async (tx) => {
      const [old] = await tx<{ student_id: string | null; amount: number; method: string; paid_at: string; is_refund: boolean; reverses: string | null; name: string }[]>`
        select y.student_id, y.amount, y.method, y.paid_at::text as paid_at, y.is_refund, y.reverses, coalesce(s.full_name, '') as name
        from crm_payments y left join crm_students s on s.id = y.student_id where y.id = ${v.paymentId} for update of y`;
      if (!old || !old.student_id) return 'notFound';
      if (old.is_refund || old.reverses) return 'locked';
      const [row] = await tx`
        insert into crm_payments (student_id, amount, method, paid_at, is_refund, note, reverses, created_by)
        values (${old.student_id}, ${old.amount}, ${old.method}, ${tashkentDayKey()}, true,
          ${`Bekor qilindi: ${dmy(old.paid_at)} dagi to‘lov · ${v.reason}`}, ${v.paymentId}, ${me.id})
        on conflict do nothing returning id`;
      if (!row) return 'locked';
      await tx`update crm_students set balance = balance - ${old.amount}, updated_at = now() where id = ${old.student_id}`;
      await tx`insert into crm_student_log (student_id, kind, text, amount, actor)
        values (${old.student_id}, 'paycancel', ${`${old.name} — ${dmy(old.paid_at)} dagi ${som(old.amount)} (${PAY_LABEL[old.method] ?? old.method}) to‘lov bekor qilindi. Sabab: ${v.reason}`}, ${-old.amount}, ${me.id})`;
      return 'ok';
    });
    if (res === 'notFound') return { error: 'notFound' };
    if (res === 'locked') return { error: 'paymentLocked' };
  } catch {
    return { error: 'updateFailed' };
  }
  refresh();
  return {};
}

export type PaymentRow = {
  id: string;
  studentId: string | null;
  student: string;
  date: string;
  amount: number;
  method: string;
  actor: string;
  note: string;
  edit: string | null;
  editedBy: string;
  editedAt: string | null;
  cancelled: boolean;
  isCancel: boolean;
  refund: boolean;
};

const payListSchema = z.object({ from: dayKey, to: dayKey });

/** To'lovlar tahlili: every payment between two days (inclusive), newest first. */
export async function listPaymentsAction(input: z.input<typeof payListSchema>): Promise<{ rows?: PaymentRow[]; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  const p = payListSchema.safeParse(input);
  if (!p.success || p.data.from > p.data.to) return { error: 'invalidInput' };
  try {
    const rows = await sql<PaymentRow[]>`
      select y.id, y.student_id as "studentId", coalesce(s.full_name, '—') as student, y.paid_at::text as date, y.amount, y.method,
        coalesce(pc.first_name || ' ' || pc.last_name, 'Import') as actor,
        coalesce(y.note, '') as note, y.edit_note as edit, coalesce(pe.first_name || ' ' || pe.last_name, '') as "editedBy",
        y.edited_at::text as "editedAt",
        exists (select 1 from crm_payments r where r.reverses = y.id) as cancelled, y.reverses is not null as "isCancel", y.is_refund as refund
      from crm_payments y
      left join crm_students s on s.id = y.student_id
      left join profiles pc on pc.id = y.created_by
      left join profiles pe on pe.id = y.edited_by
      where y.paid_at between ${p.data.from} and ${p.data.to}
      order by y.paid_at desc, y.created_at desc
      limit 2000`;
    return { rows: [...rows] };
  } catch {
    return { error: 'loadFailed' };
  }
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

const person = z.object({ name: z.string().trim().max(120).default(''), phone: z.string().trim().max(30).default('') });
const infoSchema = z.object({
  studentId: uuid,
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).default(''),
  /** Without the @; empty clears it. */
  tgUsername: z
    .string()
    .trim()
    .max(40)
    .transform((v) => v.replace(/^@+/, ''))
    .refine((v) => v === '' || /^[A-Za-z0-9_]{3,32}$/.test(v))
    .default(''),
  father: person.default({ name: '', phone: '' }),
  mother: person.default({ name: '', phone: '' }),
  guardian: person.default({ name: '', phone: '' }),
});

type Tx = TransactionSql<{}>; // eslint-disable-line @typescript-eslint/no-empty-object-type
const PARENT_UZ = { father: 'otasi', mother: 'onasi', guardian: 'vasiy' } as const;

/**
 * One parent slot (the first contact of that kind). Updated in place so a
 * Telegram link survives a phone fix; emptied → removed, unless the parent is
 * linked to the bot (then only the name and phone are cleared).
 */
async function saveParent(tx: Tx, studentId: string, kind: keyof typeof PARENT_UZ, v: { name: string; phone: string }): Promise<string | null> {
  const [row] = await tx<{ id: string; name: string | null; phone: string | null; tg: boolean }[]>`
    select id, name, phone, telegram_chat_id is not null as tg from crm_contacts
    where student_id = ${studentId} and kind = ${kind} order by is_primary desc, created_at limit 1`;
  if ((row?.name ?? '') === v.name && (row?.phone ?? '') === v.phone) return null;
  const was = [row?.name, row?.phone].filter(Boolean).join(' ');
  const now = [v.name, v.phone].filter(Boolean).join(' ');
  if (row && !now && !row.tg) await tx`delete from crm_contacts where id = ${row.id}`;
  else if (row) await tx`update crm_contacts set name = ${v.name || null}, phone = ${v.phone || null} where id = ${row.id}`;
  else if (now) {
    const [{ any }] = await tx<{ any: boolean }[]>`select exists (select 1 from crm_contacts where student_id = ${studentId} and kind <> 'student' and is_primary) as any`;
    await tx`insert into crm_contacts (student_id, kind, name, phone, is_primary) values (${studentId}, ${kind}, ${v.name || null}, ${v.phone || null}, ${!any})`;
  }
  return `${PARENT_UZ[kind]} ${was || '—'} → ${now || '—'}`;
}

/**
 * Tahrirlash: name, the student's phone and Telegram username, and the father,
 * mother and guardian each in their own slot. Every change is logged old → new.
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
      const [own] = await tx<{ id: string; phone: string | null; tgu: string | null }[]>`
        select id, phone, telegram_username as tgu from crm_contacts
        where student_id = ${v.studentId} and kind = 'student' order by is_primary desc, created_at limit 1`;
      const phoneChanged = (own?.phone ?? '') !== v.phone;
      const tguChanged = (own?.tgu ?? '') !== v.tgUsername;
      if (phoneChanged || tguChanged) {
        if (own) await tx`update crm_contacts set phone = ${v.phone || null}, telegram_username = ${v.tgUsername || null} where id = ${own.id}`;
        else if (v.phone || v.tgUsername)
          await tx`insert into crm_contacts (student_id, kind, phone, telegram_username, is_primary)
            values (${v.studentId}, 'student', ${v.phone || null}, ${v.tgUsername || null}, true)`;
        if (phoneChanged) changes.push(`telefon ${own?.phone || '—'} → ${v.phone || '—'}`);
        if (tguChanged) changes.push(`Telegram ${own?.tgu ? `@${own.tgu}` : '—'} → ${v.tgUsername ? `@${v.tgUsername}` : '—'}`);
      }
      for (const kind of ['father', 'mother', 'guardian'] as const) {
        const c = await saveParent(tx, v.studentId, kind, v[kind]);
        if (c) changes.push(c);
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
