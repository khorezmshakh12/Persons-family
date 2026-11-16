import 'server-only';
import { sql } from '@/lib/db/client';
import { tashkentDayKey } from '@/lib/time';
import { DEFAULT_FIN, type Debtor, type FinInputs, type FinMonth, type FinSettings } from '@/lib/strategy-finance';

// A real payment: money in, not a refund, not cancelled by a later refund row.
const REAL = sql`not y.is_refund and y.amount > 0 and not exists (select 1 from crm_payments r where r.reverses = y.id)`;

/** Head-count inputs for Strategiya → Moliya / Tahlil. The money itself comes
 * from the Hisob-kitob ledger via loadBooks (Ops payments are posted there,
 * migration 20261116120000); students, payers, new students and debtors come
 * straight from Operatsiya HQ (owner, 2026-11-16). */
export async function loadFinInputs(): Promise<FinInputs> {
  const today = tashkentDayKey();
  const [settings, months, paid, fresh, active, debtors] = await Promise.all([
    sql<{ value: Partial<FinSettings> }[]>`select value from acct_settings where key = 'strategy_fin'`,
    sql<FinMonth[]>`select ym, students, paid, new_students, capacity from strategy_fin_months order by ym`,
    // Distinct students with a real payment, per Tashkent month.
    sql<{ ym: string; n: number }[]>`
      select to_char(y.paid_at, 'YYYY-MM') as ym, count(distinct y.student_id)::int as n
      from crm_payments y where y.student_id is not null and ${REAL} group by 1`,
    // New students: the month of their first real payment (Ops «faol» day).
    sql<{ ym: string; n: number }[]>`
      select to_char(f.first_paid, 'YYYY-MM') as ym, count(*)::int as n from (
        select y.student_id, min(y.paid_at) as first_paid from crm_payments y
        where y.student_id is not null and ${REAL} group by y.student_id) f
      group by 1`,
    // Faol o'quvchilar now — the same rule as Operatsiya HQ › Statistika (ops-stats.ts).
    sql<{ n: number }[]>`
      select count(*)::int as n from crm_students s
      where s.archived_at is null and s.status = 'active'
        and coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) > 0
        and s.discount_pct < 100
        and (s.paid_elsewhere_at is not null or exists (select 1 from crm_payments y where y.student_id = s.id and ${REAL}))`,
    // Qarzdorlar: Ops balance below zero; overdue since the oldest unpaid charge.
    sql<Debtor[]>`
      select s.id, s.full_name as name,
        coalesce((select c.phone from crm_contacts c where c.student_id = s.id and coalesce(c.phone, '') <> ''
          order by (c.kind = 'student') desc, c.is_primary desc, c.created_at limit 1), '') as phone,
        null::uuid as course_id,
        coalesce((select string_agg(distinct g.name, ', ') from crm_enrollments e join crm_groups g on g.id = e.group_id
          where e.student_id = s.id and e.status = 'active'), '') as grp,
        -s.balance as amount,
        coalesce((select min(ch.due_date) from crm_charges ch join crm_enrollments e on e.id = ch.enrollment_id
          where e.student_id = s.id and ch.status in ('pending', 'partial', 'overdue') and ch.due_date <= ${today}::date), ${today}::date)::text as due_date
      from crm_students s
      where s.archived_at is null and s.status <> 'archived' and s.balance < 0
      order by s.balance`,
  ]);
  const map = (rows: { ym: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.ym, r.n]));
  return {
    settings: { ...DEFAULT_FIN, ...(settings[0]?.value ?? {}) },
    months: [...months],
    debtors: [...debtors],
    enrolled: map(fresh),
    ops: { paid: map(paid), active: active[0]?.n ?? 0 },
  };
}
