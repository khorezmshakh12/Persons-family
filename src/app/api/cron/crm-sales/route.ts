import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { sendToChat } from '@/lib/crm-bot';
import { fillTemplate } from '@/lib/billing';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';

// Sales: sinov darsi eslatmasi (2026-10-22). Har kuni — ertaga sinov darsi
// bor, Telegram botga ulangan lidlarga lid shabloni (audience lead, trigger
// before) yuboriladi; bir sinov sanasiga bir marta (trial_reminded_for).
//
// Cloud Scheduler (10:00 Asia/Tashkent):
//   crm-sales-daily  "0 10 * * *"  …/staff/api/cron/crm-sales  (Authorization: Bearer <CRON_SECRET>)

const dmy = (k: string) => k.split('-').reverse().join('.');

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tomorrow = addDaysToKey(tashkentDayKey(), 1);
  const [tpl] = await sql<{ name: string; body: string }[]>`
    select name, body from crm_message_templates where audience = 'lead' and trigger = 'before' order by sort limit 1`;
  if (!tpl) return NextResponse.json({ ok: true, skipped: 'no template' });

  const leads = await sql<{ id: string; name: string; course: string; time: string; chat: number }[]>`
    select l.id, coalesce(l.name, '') as name, coalesce(c.name, '') as course, coalesce(l.trial_time, '') as time, l.telegram_chat_id as chat
    from crm_leads l left join crm_courses c on c.id = l.course_id
    where l.archived_at is null and l.telegram_chat_id is not null and l.trial_date = ${tomorrow}
      and l.trial_reminded_for is distinct from l.trial_date
      and l.converted_student_id is null and l.status = 'open'`;

  let sent = 0;
  for (const l of leads) {
    const [claimed] = await sql`update crm_leads set trial_reminded_for = trial_date where id = ${l.id} and trial_reminded_for is distinct from trial_date returning id`;
    if (!claimed) continue;
    const text = fillTemplate(tpl.body, { ism: l.name.split(' ')[0] || l.name, kurs: l.course || 'tanlangan', sinov_sana: dmy(tomorrow), sinov_vaqt: l.time || '—' });
    const ok = await sendToChat(Number(l.chat), text);
    await sql`insert into crm_messages (lead_id, channel, direction, body, status, sent_at) values (${l.id}, 'telegram', 'out', ${text}, ${ok ? 'sent' : 'failed'}, now())`;
    await sql`insert into crm_lead_log (lead_id, text) values (${l.id}, ${ok ? `«${tpl.name}» yuborildi` : `«${tpl.name}» yuborilmadi (Telegram xatosi)`})`;
    if (ok) sent++;
  }
  return NextResponse.json({ ok: true, day: tomorrow, leads: leads.length, sent });
}

export const GET = withCronLog('crm-sales', handle);
