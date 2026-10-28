'use server';

import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { feeAfterDiscount } from '@/lib/billing';
import { computeHealth, monthEnd, shiftMonthKey, type Health, type HealthStudent } from '@/lib/ops-health';
import { startOfTashkentMonthKey, tashkentDayKey } from '@/lib/time';

// Operation HQ › Statistika › Markaz holati: one month of the centre's state,
// read from the student, payment, lead, group and attendance rows (read-only).

export async function getOpsHealthAction(month?: string): Promise<{ health?: Health; error?: string }> {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) return { error: 'forbidden' };
  const today = tashkentDayKey();
  const cur = startOfTashkentMonthKey();
  const m = month && /^\d{4}-\d{2}-01$/.test(month) && month <= cur && month >= '2024-01-01' ? month : cur;
  const from = shiftMonthKey(m, -5);
  const to = monthEnd(m) < today ? monthEnd(m) : today;
  try {
    const [students, leads, groups, collected, [att], [paid]] = await Promise.all([
      sql<{
        id: string; name: string; status: HealthStudent['status']; created: string; activated: string | null; left: string | null;
        leave_reason: string | null; monthly_fee: number | null; enr_fee: number; discount_pct: number; balance: number;
        parent_phone: boolean; in_group: boolean;
      }[]>`
        select s.id, s.full_name as name, s.status,
          (s.created_at at time zone 'Asia/Tashkent')::date::text as created,
          least(fp.d, (s.paid_elsewhere_at at time zone 'Asia/Tashkent')::date)::text as activated,
          (s.archived_at at time zone 'Asia/Tashkent')::date::text as left,
          s.leave_reason, s.monthly_fee, coalesce(en.fee, 0) as enr_fee, s.discount_pct, s.balance,
          exists (select 1 from crm_contacts c where c.student_id = s.id and c.kind <> 'student' and coalesce(c.phone, '') <> '') as parent_phone,
          coalesce(en.n, 0) > 0 as in_group
        from crm_students s
        left join lateral (
          select min(y.paid_at) as d from crm_payments y
          where y.student_id = s.id and not y.is_refund and y.amount > 0
            and not exists (select 1 from crm_payments r where r.reverses = y.id)
        ) fp on true
        left join lateral (
          select sum(e.tariff_amount) as fee, count(*) as n from crm_enrollments e where e.student_id = s.id and e.status = 'active'
        ) en on true`,
      sql<{ created: string; source: string; trial: boolean; student_id: string | null; lost_reason: string | null }[]>`
        select (l.created_at at time zone 'Asia/Tashkent')::date::text as created, coalesce(nullif(l.source, ''), 'Noma’lum') as source,
          l.trial_date is not null as trial, l.converted_student_id as student_id, l.lost_reason
        from crm_leads l
        where (l.created_at at time zone 'Asia/Tashkent')::date between ${m} and ${to}`,
      sql<{ name: string; limit: number; students: number }[]>`
        select g.name, g.student_limit as limit,
          (select count(*) from crm_enrollments e join crm_students s on s.id = e.student_id
            where e.group_id = g.id and e.status = 'active' and s.archived_at is null)::int as students
        from crm_groups g where g.status = 'active' and g.archived_at is null`,
      sql<{ month: string; amount: number }[]>`
        select date_trunc('month', paid_at)::date::text as month, sum(case when is_refund then -amount else amount end) as amount
        from crm_payments where paid_at between ${from} and ${to} group by 1`,
      sql<{ present: number; marked: number }[]>`
        select count(*) filter (where present)::int as present, count(*)::int as marked
        from crm_attendance where att_date between ${m} and ${to} and not is_trial`.catch(() => [{ present: 0, marked: 0 }]),
      sql<{ total: number; students: number }[]>`
        select coalesce(sum(case when is_refund then -amount else amount end), 0) as total, count(distinct student_id)::int as students
        from crm_payments where student_id is not null`,
    ]);
    const health = computeHealth({
      month: m,
      today,
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.left ? 'archived' : s.status,
        created: s.created,
        activated: s.activated,
        left: s.left,
        leaveReason: s.leave_reason ?? '',
        fee: feeAfterDiscount(s.monthly_fee ?? s.enr_fee, s.discount_pct),
        balance: s.balance,
        hasParentPhone: s.parent_phone,
        inGroup: s.in_group,
      })),
      leads: leads.map((l) => ({ created: l.created, source: l.source, trial: l.trial, studentId: l.student_id, lostReason: l.lost_reason ?? '' })),
      groups: [...groups],
      collected: Object.fromEntries(collected.map((c) => [c.month, Number(c.amount)])),
      attendance: att ?? { present: 0, marked: 0 },
      paidAllTime: { total: Number(paid?.total ?? 0), students: paid?.students ?? 0 },
    });
    return { health };
  } catch (e) {
    console.error('[ops-health] load failed', e);
    return { error: 'loadFailed' };
  }
}
