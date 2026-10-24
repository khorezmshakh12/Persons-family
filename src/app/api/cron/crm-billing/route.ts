import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { formatUZS } from '@/lib/format-currency';
import { currentDueDate, daysBetween, feeAfterDiscount, nextDueDate, periodParts } from '@/lib/billing';
import { renderMessage, sendToStudentContacts, studentVars } from '@/lib/student-messages';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

// Oylik avto-yechim + eslatma (2026-10-23, Operation HQ › O'quvchilar).
// Har kuni:
//   1. muzlatish muddati o'tganlar qayta faollashadi;
//   2. to'lov kuni (aktiv bo'lgan sana) kelgan o'quvchiga shu davr charge'i
//      yoziladi (chegirma bilan; bo'lib to'lashda ikki qism) va balans kamayadi;
//   3. «before» shabloni to'lovdan remind_days kun oldin, «due» — to'lov kuni
//      ota-onaga CRM bot orqali yuboriladi (bir davrga bir marta).
//
// Cloud Scheduler (09:00 Asia/Tashkent):
//   gcloud scheduler jobs create http crm-billing-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 9 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/crm-billing" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

type Stu = { id: string; name: string; fee: number; discount: number; installments: number; start: string | null };

const som = (v: number) => `${formatUZS(Math.round(v))} so‘m`;
const dmy = (k: string) => k.split('-').reverse().join('.');

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = tashkentDayKey();
  const [cfg] = await sql<{ enabled: boolean; start_date: string; remind_days: number }[]>`
    select enabled, start_date::text as start_date, remind_days from crm_billing_settings where id`;
  if (!cfg?.enabled) return NextResponse.json({ ok: true, skipped: 'disabled', day: today });

  // 1) Freezes that ran out.
  const thawed = await sql<{ id: string; name: string }[]>`
    update crm_students set status = 'active', frozen_until = null, updated_at = now()
    where status = 'frozen' and archived_at is null and frozen_until is not null and frozen_until < ${today}
    returning id, full_name as name`;
  for (const t of thawed) await sql`insert into crm_student_log (student_id, kind, text) values (${t.id}, 'freeze', ${`${t.name} — muzlatish tugadi, qayta faol`})`;

  const students = await sql<Stu[]>`
    select s.id, s.full_name as name, s.discount_pct as discount, s.installments,
      coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) as fee,
      coalesce(s.billing_start, (select min(e.activation_date) from crm_enrollments e where e.student_id = s.id and e.status = 'active'))::text as start
    from crm_students s
    where s.archived_at is null and s.status = 'active'
      -- faol = kamida bitta to'lov qilgan yoki qo'lda faol (boshqa CRM'da to'lagan) (liddan kelgan o'quvchi birinchi to'lovgacha yechilmaydi)
      and (s.paid_elsewhere_at is not null or exists (select 1 from crm_payments y where y.student_id = s.id and not y.is_refund and y.amount > 0))`;

  // 2) Charges. A charge without a period key near this due date (enroll's
  // first charge, an import) already covers the period's first part.
  let charged = 0;
  let total = 0;
  for (const s of students) {
    const fee = feeAfterDiscount(s.fee, s.discount);
    if (!s.start || fee <= 0) continue;
    const due = currentDueDate(s.start, today);
    if (!due || due < cfg.start_date) continue;
    for (const part of periodParts(s.start, due, fee, s.installments)) {
      if (part.date > today) continue;
      const done = await sql.begin(async (tx) => {
        if (!part.key.endsWith('#2')) {
          const [legacy] = await tx`
            select 1 from crm_charges c left join crm_enrollments e on e.id = c.enrollment_id
            where coalesce(c.student_id, e.student_id) = ${s.id} and c.period_key is null
              and c.period_start between ${addDaysToKey(due, -20)} and ${addDaysToKey(due, 20)} limit 1`;
          if (legacy) return false;
        }
        const end = addDaysToKey(nextDueDate(s.start!, addDaysToKey(due, 1)), -1);
        const [row] = await tx`
          insert into crm_charges (student_id, period_start, period_end, amount, due_date, status, period_key, source, note)
          values (${s.id}, ${due}, ${end}, ${part.amount}, ${part.date}, 'pending', ${part.key}, 'auto',
            ${s.installments === 2 ? `${dmy(due)} davri, ${part.key.endsWith('#1') ? '1' : '2'}-qism` : `${dmy(due)} davri`})
          on conflict (student_id, period_key) where period_key is not null do nothing
          returning id`;
        if (!row) return false;
        await tx`update crm_students set balance = balance - ${part.amount}, updated_at = now() where id = ${s.id}`;
        await tx`insert into crm_student_log (student_id, kind, text, amount)
          values (${s.id}, 'charge', ${`${s.name} — ${som(part.amount)} oylik yechildi`}, ${part.amount})`;
        return true;
      });
      if (done) {
        charged++;
        total += part.amount;
      }
    }
  }

  // 3) Reminders from the «before» and «due» templates.
  const templates = await sql<{ id: string; name: string; body: string; trigger: 'before' | 'due' }[]>`
    select id, name, body, trigger from crm_message_templates where audience = 'student' and trigger in ('before', 'due') order by sort`;
  let reminders = 0;
  if (templates.length) {
    const linked = new Set(
      (await sql<{ sid: string }[]>`select distinct student_id as sid from crm_contacts where telegram_chat_id is not null`).map((r) => r.sid),
    );
    for (const s of students) {
      if (!s.start || !linked.has(s.id) || feeAfterDiscount(s.fee, s.discount) <= 0) continue;
      const next = nextDueDate(s.start, today);
      if (next < cfg.start_date) continue;
      const left = daysBetween(today, next);
      const trigger = left === 0 ? 'due' : left > 0 && left <= cfg.remind_days ? 'before' : null;
      const tpl = trigger && templates.find((t) => t.trigger === trigger);
      if (!tpl) continue;
      const vars = await studentVars(s.id);
      if (!vars) continue;
      const text = renderMessage(tpl.body, vars);
      const [fresh] = await sql<{ id: string }[]>`
        insert into crm_student_messages (student_id, template_id, title, trigger, due_date, body)
        values (${s.id}, ${tpl.id}, ${tpl.name}, ${tpl.trigger}, ${next}, ${text})
        on conflict (student_id, trigger, due_date) where trigger in ('before', 'due') do nothing returning id`;
      if (!fresh) continue;
      const r = await sendToStudentContacts(s.id, text);
      await sql`update crm_student_messages set recipients = ${r.recipients}, sent = ${r.sent} where id = ${fresh.id}`;
      if (r.sent) {
        reminders++;
        await sql`insert into crm_student_log (student_id, kind, text) values (${s.id}, 'msg', ${`${s.name} ota-onasiga «${tpl.name}» yuborildi`})`;
      }
    }
  }

  return NextResponse.json({ ok: true, day: today, thawed: thawed.length, charged, total, reminders });
}

export const GET = withCronLog('crm-billing', handle);
