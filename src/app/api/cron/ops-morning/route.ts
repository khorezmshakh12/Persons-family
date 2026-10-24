import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { SECTION_ROLES } from '@/lib/permissions';
import { formatUZS } from '@/lib/format-currency';
import { nextDueDate } from '@/lib/billing';
import { sendTelegramManyAs } from '@/lib/telegram';
import { tashkentDayKey } from '@/lib/time';

// Operation HQ ertalabki xabari (2026-10-22, guruhlarsiz): har kuni 08:00 da
// Operation HQ'ni ko'ra oladiganlarga «Bugungi ish» — javob kutayotgan
// lidlar, bugungi qo'ng'iroqlar va sinov darslari, bugun to'lov kuni kelgan
// o'quvchilar, uzoq qarzdorlar.
//
// Cloud Scheduler (08:00 Asia/Tashkent, Du–Sha): ops-morning-daily "0 8 * * 1-6".

const WEEKDAYS_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const day = tashkentDayKey();
  const roles = [...SECTION_ROLES.operations] as string[];
  const [[leads], students, [debt], recipients] = await Promise.all([
    sql<{ waiting: number; overnight: number; follow: number; trials: number }[]>`
      select
        count(*) filter (where first_contact_at is null and created_at < now() - interval '15 minutes')::int as waiting,
        count(*) filter (where created_at >= now() - interval '24 hours')::int as overnight,
        count(*) filter (where next_at <= ${day})::int as follow,
        count(*) filter (where trial_date = ${day})::int as trials
      from crm_leads where archived_at is null and status = 'open' and converted_student_id is null`,
    sql<{ fee: number; start: string | null }[]>`
      select coalesce(s.monthly_fee, (select sum(e.tariff_amount) from crm_enrollments e where e.student_id = s.id and e.status = 'active'), 0) as fee,
        coalesce(s.billing_start, (select min(e.activation_date) from crm_enrollments e where e.student_id = s.id and e.status = 'active'))::text as start
      from crm_students s where s.archived_at is null and s.status = 'active'
        and (s.paid_elsewhere_at is not null or exists (select 1 from crm_payments y where y.student_id = s.id and not y.is_refund and y.amount > 0))`,
    sql<{ n: number; sum: number }[]>`
      select count(*)::int as n, coalesce(-sum(balance), 0) as sum from crm_students where archived_at is null and balance < 0`,
    sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles p
      where p.is_active and p.telegram_id is not null
        and (p.role::text = any(${roles}) or exists (select 1 from profile_roles r where r.user_id = p.id and r.role::text = any(${roles})))`,
  ]);
  const due = students.filter((s) => s.fee > 0 && s.start && nextDueDate(s.start, day) === day);
  const dueSum = due.reduce((a, s) => a + s.fee, 0);

  const text = [
    `☀️ <b>Operation HQ · bugungi ish</b>`,
    `🗓 ${day.split('-').reverse().join('.')}, ${WEEKDAYS_UZ[new Date(`${day}T00:00:00Z`).getUTCDay()]}`,
    '',
    `<b>Sotuv</b>`,
    `• Oxirgi 24 soatda yangi lid: ${leads.overnight}`,
    leads.waiting ? `• ⚠️ Javob kutayotgan lidlar: <b>${leads.waiting}</b> — birinchi navbatda qo‘ng‘iroq qiling` : '• Hamma lid bilan bog‘lanilgan ✅',
    `• Bugungi qo‘ng‘iroqlar (keyingi qadam): ${leads.follow}`,
    `• Bugungi sinov darslari: ${leads.trials}`,
    '',
    `<b>To‘lovlar</b>`,
    `• Bugun to‘lov kuni: ${due.length} o‘quvchi · ${formatUZS(dueSum)} so‘m`,
    `• Qarzdorlar: ${debt.n} nafar · ${formatUZS(debt.sum)} so‘m`,
    '',
    'Batafsil: Operation HQ › Bugun.',
  ].join('\n');

  await sendTelegramManyAs('report', recipients.map((r) => r.telegram_id), text, { record: false });
  return NextResponse.json({ ok: true, day, recipients: recipients.length });
}

export const GET = withCronLog('ops-morning', handle);
