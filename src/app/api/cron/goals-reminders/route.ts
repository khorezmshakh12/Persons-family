import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { tashkentDayKey } from '@/lib/time';
import { NEXT_LABEL, type GoalScope } from '@/lib/goals';

// Maqsad muddati eslatmasi (har 15 daqiqada, 07:00–22:45 Toshkent):
//  - soatli muddat: muddatdan ≤ 60 daqiqa oldin;
//  - faqat sanali muddat (haftalik/oylik): o'sha kuni 09:00 dan keyin.
// Har maqsadga bir marta (reminded_at), «✅ Bajarildi» / «➡️ Ertaga» tugmalari
// bilan (telegram-bot-handlers.ts, g:d / g:n).
//
// Cloud Scheduler:
//   gcloud scheduler jobs create http goals-reminders \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="*/15 7-22 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/goals-reminders" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

const clockAt = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(11, 16);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = tashkentDayKey();
  const now = Date.now();
  const clock = clockAt(now);
  // Same day only: past midnight the horizon is capped at 23:59.
  const later = clockAt(now + 60 * 60_000);
  const horizon = later < clock ? '23:59' : later;

  // Claim first (reminded_at), then send: two overlapping runs can't double-send.
  const due = await sql<{ id: string; scope: GoalScope; title: string; due_time: string | null; telegram_id: string }[]>`
    update goals g set reminded_at = now()
    from profiles p
    where p.id = g.user_id and p.is_active and p.telegram_id is not null
      and not g.done and g.reminded_at is null and g.due_date = ${today}::date
      and ((g.due_time is not null and g.due_time > ${clock} and g.due_time <= ${horizon})
        or (g.due_time is null and ${clock} >= '09:00'))
    returning g.id, g.scope, g.title, g.due_time, p.telegram_id`;

  let sent = 0;
  for (const g of due) {
    const left = g.due_time ? toMin(g.due_time) - toMin(clock) : 0;
    const text = g.due_time
      ? `⏰ <b>${left >= 60 ? '1 soat' : `${left} daqiqa`} qoldi</b>\n«${escapeTelegramText(g.title)}» — muddat bugun <b>${g.due_time}</b>.`
      : `📅 <b>Bugun muddat</b>\n«${escapeTelegramText(g.title)}» — ${g.scope === 'week' ? 'haftalik' : 'oylik'} maqsad.`;
    try {
      await sendTelegramAs('goals', g.telegram_id, text, {
        record: false,
        replyMarkup: {
          inline_keyboard: [[
            { text: '✅ Bajarildi', callback_data: `g:d:${g.id}` },
            { text: `➡️ ${NEXT_LABEL[g.scope]}`, callback_data: `g:n:${g.id}` },
          ]],
        },
      });
      sent++;
    } catch (error) {
      console.error('[goals-reminders] send failed', g.id, error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({ ok: true, clock, due: due.length, sent });
}

export const GET = withCronLog('goals-reminders', handle);
