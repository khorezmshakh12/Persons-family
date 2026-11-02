import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { openAppKeyboard, sendTelegramAs } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { buildDailyReport, doneStreak, weekKeyOf } from '@/lib/goals';
import { toGoalItem, type GoalRow } from '@/lib/goals-server';

// Har bir xodimga shaxsiy kunlik maqsadlar hisoboti (Toshkent 21:00):
// natija, bajarilganlar (vaqti bilan), ertaga o'tadiganlar, muddati
// o'tganlar, haftalik foiz va seriya. Bugun kunlik maqsadi yo'q xodimga
// yuborilmaydi. Sozlamalar › Bildirishnomalar › «Maqsadlar» bilan o'chiriladi.
//
// Cloud Scheduler (21:00 Asia/Tashkent):
//   gcloud scheduler jobs create http goals-report-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 21 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/goals-report" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = tashkentDayKey();
  const monday = weekKeyOf(today);
  const clock = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(11, 16);

  const people = await sql<{ id: string; first_name: string | null; last_name: string | null; telegram_id: string }[]>`
    select p.id, p.first_name, p.last_name, p.telegram_id from profiles p
    where p.is_active and p.telegram_id is not null
      and exists (select 1 from goals g where g.user_id = p.id and g.scope = 'day' and g.period_key = ${today})`;

  let sent = 0;
  for (const p of people) {
    try {
      const [goals, week, doneDays] = await Promise.all([
        sql<GoalRow[]>`
          select id, scope, title, done, priority, carry_count, moved_from, due_time,
            to_char(due_date, 'YYYY-MM-DD') as due_date,
            to_char(done_at at time zone 'Asia/Tashkent', 'HH24:MI') as done_at
          from goals where user_id = ${p.id} and scope = 'day' and period_key = ${today}
          order by created_at`,
        sql<{ done: number; total: number }[]>`
          select count(*) filter (where done)::int as done, count(*)::int as total
          from goals where user_id = ${p.id} and scope = 'day' and period_key between ${monday} and ${today}`,
        sql<{ d: string }[]>`
          select distinct to_char(done_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as d
          from goals where user_id = ${p.id} and scope = 'day' and done and done_at >= ${addDaysToKey(today, -60)}::date`,
      ]);
      const text = buildDailyReport({
        dayKey: today,
        clock,
        name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Xodim',
        goals: goals.map(toGoalItem),
        week: week[0] ?? { done: 0, total: 0 },
        streak: doneStreak(new Set(doneDays.map((r) => r.d)), today),
      });
      if (!text) continue;
      await sendTelegramAs('goals', p.telegram_id, text, { record: false, replyMarkup: openAppKeyboard('📋 Maqsadlarim') });
      sent++;
    } catch (error) {
      console.error('[goals-report] failed for', p.id, error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({ ok: true, day: today, people: people.length, sent });
}

export const GET = withCronLog('goals-report', handle);
