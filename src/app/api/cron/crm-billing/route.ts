import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { sendToChat } from '@/lib/crm-bot';
import { formatUZS } from '@/lib/format-currency';
import { currentDueDate, daysBetween, nextDueDate } from '@/lib/billing';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

// Oylik avto-yechim + eslatma (2026-10-23, Operation HQ › O'quvchilar).
// Har kuni: aktiv abonementning to'lov kuni (aktiv bo'lgan sana) kelgan bo'lsa,
// shu davr uchun charge yoziladi va balans kamayadi; to'lovdan remind_days kun
// oldin va to'lov kuni ota-onaga CRM bot orqali xabar boradi.
//
// Cloud Scheduler (09:00 Asia/Tashkent):
//   gcloud scheduler jobs create http crm-billing-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 9 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/crm-billing" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

type Enr = { id: string; student_id: string; fee: number; activation: string; name: string; group_name: string };

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

  const enrollments = await sql<Enr[]>`
    select e.id, e.student_id, e.tariff_amount as fee, e.activation_date::text as activation,
      s.full_name as name, g.name as group_name
    from crm_enrollments e
    join crm_students s on s.id = e.student_id
    join crm_groups g on g.id = e.group_id
    where e.status = 'active' and e.tariff_amount > 0
      and s.archived_at is null and s.status = 'active'`;

  // 1) Charges. One per billing period: a charge already near this due date
  // (enroll's first charge, an import, yesterday's run) blocks a second one.
  let charged = 0;
  let total = 0;
  for (const e of enrollments) {
    const due = currentDueDate(e.activation, today);
    if (!due || due < cfg.start_date) continue;
    const end = addDaysToKey(nextDueDate(e.activation, addDaysToKey(due, 1)), -1);
    const done = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`crm-billing:${e.id}`}))`;
      const [dup] = await tx`
        select 1 from crm_charges where enrollment_id = ${e.id}
          and period_start between ${addDaysToKey(due, -20)} and ${addDaysToKey(due, 20)} limit 1`;
      if (dup) return false;
      await tx`
        insert into crm_charges (enrollment_id, period_start, period_end, amount, due_date, status)
        values (${e.id}, ${due}, ${end}, ${e.fee}, ${due}, 'pending')`;
      await tx`update crm_students set balance = balance - ${e.fee}, updated_at = now() where id = ${e.student_id}`;
      return true;
    });
    if (done) {
      charged++;
      total += e.fee;
    }
  }

  // 2) Reminders to parents linked to the CRM bot: `remind_days` before, and on the day.
  const ids = [...new Set(enrollments.map((e) => e.student_id))];
  const [contacts, balances] = ids.length
    ? await Promise.all([
        sql<{ student_id: string; chat: number }[]>`
          select distinct student_id, telegram_chat_id as chat from crm_contacts
          where telegram_chat_id is not null and student_id = any(${ids})`,
        sql<{ id: string; balance: number }[]>`select id, balance from crm_students where id = any(${ids})`,
      ])
    : [[], []];
  const chatsOf = new Map<string, number[]>();
  for (const c of contacts) chatsOf.set(c.student_id, [...(chatsOf.get(c.student_id) ?? []), Number(c.chat)]);
  const balOf = new Map(balances.map((b) => [b.id, b.balance]));

  let reminders = 0;
  for (const e of enrollments) {
    const chats = chatsOf.get(e.student_id);
    if (!chats?.length) continue;
    const next = nextDueDate(e.activation, today);
    if (next < cfg.start_date) continue;
    const left = daysBetween(today, next);
    const kind = left === 0 ? 'due' : left > 0 && left <= cfg.remind_days ? 'before' : null;
    if (!kind) continue;
    const [fresh] = await sql`
      insert into crm_billing_notices (enrollment_id, due_date, kind) values (${e.id}, ${next}, ${kind})
      on conflict do nothing returning 1`;
    if (!fresh) continue;
    const debt = Math.max(0, -(balOf.get(e.student_id) ?? 0));
    const text =
      kind === 'before'
        ? `Assalomu alaykum! ${e.name} (${e.group_name}) uchun oylik to‘lov — ${som(e.fee)}, to‘lov kuni ${dmy(next)}.` +
          (debt > 0 ? `\nHozirgi qarz: ${som(debt)}.` : '') +
          '\nIltimos, o‘z vaqtida to‘lang. Rahmat! — Persons'
        : `Assalomu alaykum! Bugun ${e.name} (${e.group_name}) uchun oylik to‘lov kuni: ${som(e.fee)}.` +
          (debt > 0 ? `\nJami to‘lanishi kerak: ${som(debt)}.` : '') +
          '\nRahmat! — Persons';
    let sent = 0;
    for (const chat of chats) if (await sendToChat(chat, text)) sent++;
    await sql`update crm_billing_notices set sent = ${sent} where enrollment_id = ${e.id} and due_date = ${next} and kind = ${kind}`;
    if (sent) reminders++;
  }

  return NextResponse.json({ ok: true, day: today, charged, total, reminders });
}

export const GET = withCronLog('crm-billing', handle);
