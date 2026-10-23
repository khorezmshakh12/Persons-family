import 'server-only';
import { sql } from '@/lib/db/client';
import { gradeOf, feeAfterDiscount, type GradeResult } from '@/lib/billing';
import { addDaysToKey, tashkentDayKey, tashkentMonthKey } from '@/lib/time';

// Operation HQ › O'quvchilar (2026-10-23): every CRM student (crm_students) with
// the billing view the tab needs. Fee and start come from the student, or from
// their active enrollments when not set there; the grade is computed from the
// last 8 months of charges and payments.

export type StudentRow = {
  id: string;
  name: string;
  phone: string;
  parent: string;
  status: 'active' | 'frozen' | 'archived';
  /**
   * Faol o'quvchi — automatic, never set by hand: a monthly fee is set, at
   * least one real payment came in, and not frozen or archived. A student made
   * from a lead stays «faol emas» until the first payment.
   */
  active: boolean;
  /** Why not faol (only when status is 'active'): no fee yet, or no payment yet. */
  inactiveWhy: '' | 'nofee' | 'nopay';
  balance: number;
  tg: boolean;
  /** Fee before discount (student's own, else the active enrollments' tariffs). */
  feeBase: number;
  feeOwn: boolean;
  /** Fee actually charged each month. */
  fee: number;
  discountPct: number;
  discountReason: string;
  installments: number;
  start: string | null;
  frozenUntil: string | null;
  archivedAt: string | null;
  leaveReason: string;
  leaveNote: string;
  archivedBy: string;
  grade: GradeResult;
  /** Last 3 marked lessons all missed. */
  risk: boolean;
  paidThisMonth: boolean;
  lastCall: { result: string; at: string; promised: string | null; note: string } | null;
};

export type StudentLog = { id: string; studentId: string | null; name: string; kind: string; text: string; actor: string; at: string };
export type MessageTemplate = { id: string; name: string; body: string; trigger: 'before' | 'due' | 'paid' | 'none' };
export type BillingSettings = { enabled: boolean; startDate: string; remindDays: number; payLink: string; callAfterDays: number };

export type StudentsData = {
  rows: StudentRow[];
  log: StudentLog[];
  templates: MessageTemplate[];
  settings: BillingSettings;
  stats: {
    month: string;
    collected: number;
    methods: { method: string; amount: number }[];
    /** This month's payments by who took them and how; `today` rows make the daily cash close. */
    kassa: { actor: string; method: string; amount: number; count: number; today: boolean }[];
    reasons: { reason: string; n: number }[];
  };
};

export const DEFAULT_SETTINGS = (day: string): BillingSettings => ({ enabled: false, startDate: day, remindDays: 3, payLink: '', callAfterDays: 7 });

/** What the tab shows when the billing tables are not there yet (migration pending). */
export const emptyStudentsData = (day: string): StudentsData => ({
  rows: [],
  log: [],
  templates: [],
  settings: DEFAULT_SETTINGS(day),
  stats: { month: day.slice(0, 7), collected: 0, methods: [], kassa: [], reasons: [] },
});

export async function loadStudentsData(): Promise<StudentsData> {
  const today = tashkentDayKey();
  const month = tashkentMonthKey();
  const from = addDaysToKey(today, -245);
  const [students, charges, payments, attendance, calls, log, templates, settings, reasons, kassa, payers] = await Promise.all([
    sql<{
      id: string; name: string; status: StudentRow['status']; balance: number; monthly_fee: number | null; billing_start: string | null;
      discount_pct: number; discount_reason: string | null; installments: number; frozen_until: string | null; archived_at: string | null;
      leave_reason: string | null; leave_note: string | null; archived_by: string; phone: string; parent: string; tg: boolean;
      enr_fee: number; enr_start: string | null;
    }[]>`
      select s.id, s.full_name as name, s.status, s.balance, s.monthly_fee, s.billing_start::text as billing_start,
        s.discount_pct, s.discount_reason, s.installments, s.frozen_until::text as frozen_until,
        to_char(s.archived_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as archived_at, s.leave_reason, s.leave_note,
        coalesce(p.first_name || ' ' || p.last_name, '') as archived_by,
        coalesce((select c.phone from crm_contacts c where c.student_id = s.id and coalesce(c.phone, '') <> ''
          order by (c.kind = 'student') desc, c.is_primary desc, c.created_at limit 1), '') as phone,
        coalesce((select coalesce(nullif(c.name, ''), c.phone) || case c.kind when 'father' then ' (ota)' when 'mother' then ' (ona)' when 'guardian' then ' (vasiy)' else '' end
          from crm_contacts c where c.student_id = s.id and c.kind <> 'student'
          order by c.is_primary desc, c.created_at limit 1), '') as parent,
        exists (select 1 from crm_contacts c where c.student_id = s.id and c.telegram_chat_id is not null) as tg,
        coalesce(en.fee, 0) as enr_fee, en.start as enr_start
      from crm_students s
      left join profiles p on p.id = s.archived_by
      left join lateral (
        select sum(e.tariff_amount) as fee, min(e.activation_date)::text as start
        from crm_enrollments e where e.student_id = s.id and e.status = 'active'
      ) en on true
      order by s.full_name`,
    sql<{ sid: string; date: string; amount: number }[]>`
      select coalesce(c.student_id, e.student_id) as sid, c.due_date::text as date, c.amount
      from crm_charges c left join crm_enrollments e on e.id = c.enrollment_id
      where c.due_date >= ${from} and c.status <> 'waived'`,
    sql<{ sid: string; date: string; amount: number }[]>`
      select student_id as sid, paid_at::text as date, case when is_refund then -amount else amount end as amount
      from crm_payments where student_id is not null and paid_at >= ${from}`,
    sql<{ sid: string; missed: number; marked: number }[]>`
      select student_id as sid, count(*) filter (where not present)::int as missed, count(*)::int as marked
      from (
        select student_id, present, row_number() over (partition by student_id order by att_date desc) as rn
        from crm_attendance where att_date >= ${addDaysToKey(today, -30)} and not is_trial
      ) a where rn <= 3 group by student_id`.catch(() => []),
    sql<{ sid: string; result: string; at: string; promised: string | null; note: string }[]>`
      select distinct on (student_id) student_id as sid, result, created_at::text as at, promised_date::text as promised, note
      from crm_debt_calls order by student_id, created_at desc`,
    sql<StudentLog[]>`
      select * from (
        select l.id, l.student_id as "studentId", coalesce(s.full_name, '') as name, l.kind, l.text,
          coalesce(p.first_name || ' ' || p.last_name, 'Avto') as actor, l.created_at::text as at
        from crm_student_log l left join crm_students s on s.id = l.student_id left join profiles p on p.id = l.actor
        order by l.created_at desc limit 60
      ) x order by at desc`,
    sql<MessageTemplate[]>`select id, name, body, trigger from crm_message_templates where audience = 'student' order by sort, name`,
    sql<BillingSettings[]>`
      select enabled, start_date::text as "startDate", remind_days as "remindDays", pay_link as "payLink", call_after_days as "callAfterDays"
      from crm_billing_settings where id`,
    sql<{ reason: string; n: number }[]>`
      select coalesce(nullif(leave_reason, ''), 'Sababsiz') as reason, count(*)::int as n from crm_students
      where archived_at >= now() - interval '90 days' group by 1 order by 2 desc`,
    sql<{ actor: string; method: string; amount: number; count: number; today: boolean }[]>`
      select coalesce(p.first_name || ' ' || p.last_name, 'Import') as actor, y.method, (y.paid_at = ${today}) as today,
        sum(case when y.is_refund then -y.amount else y.amount end) as amount, count(*)::int as count
      from crm_payments y left join profiles p on p.id = y.created_by
      where y.paid_at >= ${`${month}-01`}
      group by 1, 2, 3 order by 4 desc`,
    sql<{ sid: string }[]>`select distinct student_id as sid from crm_payments where student_id is not null and not is_refund and amount > 0`,
  ]);

  const byStudent = <T extends { sid: string }>(rows: readonly T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.sid, [...(m.get(r.sid) ?? []), r]);
    return m;
  };
  const ch = byStudent(charges);
  const pay = byStudent(payments);
  const att = new Map(attendance.map((a) => [a.sid, a]));
  const call = new Map(calls.map((c) => [c.sid, c]));
  const paidEver = new Set(payers.map((p) => p.sid));

  const rows: StudentRow[] = students.map((s) => {
    const feeBase = s.monthly_fee ?? s.enr_fee;
    const fee = feeAfterDiscount(feeBase, s.discount_pct);
    const pays = pay.get(s.id) ?? [];
    const a = att.get(s.id);
    const status = s.archived_at ? 'archived' : s.status;
    const inactiveWhy = status !== 'active' ? '' : fee <= 0 ? 'nofee' : paidEver.has(s.id) ? '' : 'nopay';
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      parent: s.parent,
      status,
      active: status === 'active' && inactiveWhy === '',
      inactiveWhy,
      balance: s.balance,
      tg: s.tg,
      feeBase,
      feeOwn: s.monthly_fee != null,
      fee,
      discountPct: s.discount_pct,
      discountReason: s.discount_reason ?? '',
      installments: s.installments,
      start: s.billing_start ?? s.enr_start,
      frozenUntil: s.frozen_until,
      archivedAt: s.archived_at,
      leaveReason: s.leave_reason ?? '',
      leaveNote: s.leave_note ?? '',
      archivedBy: s.archived_by,
      grade: gradeOf(ch.get(s.id) ?? [], pays, today, fee > 0 ? Math.max(0, -s.balance) / fee : 0),
      risk: !!a && a.marked >= 3 && a.missed >= 3,
      paidThisMonth: pays.some((p) => p.amount > 0 && p.date.startsWith(month)),
      lastCall: call.get(s.id) ?? null,
    };
  });

  const methods = new Map<string, number>();
  for (const k of kassa) methods.set(k.method, (methods.get(k.method) ?? 0) + k.amount);

  return {
    rows,
    log: [...log],
    templates: [...templates],
    settings: settings[0] ?? DEFAULT_SETTINGS(today),
    stats: {
      month,
      collected: kassa.reduce((a, k) => a + k.amount, 0),
      methods: [...methods].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
      kassa: [...kassa],
      reasons: [...reasons],
    },
  };
}
