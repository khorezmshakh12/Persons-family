import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { formatDayUz, periodKeysFor, progressBar, shiftDue, workingDay, type GoalScope } from '@/lib/goals';

// Maqsadlar: tungi avtomatik ko'chish (Toshkent 00:10). Avval KECHAGI kunlik
// maqsadlar bo'yicha rahbarga (CEO) qisqa xulosa yuboriladi — ko'chishdan
// oldin, chunki keyin bajarilmaganlar bugunga o'tib ketadi. So'ng har bir
// bajarilmagan maqsad joriy davrga o'tadi (kunlik — bugunga, yakshanba
// bo'lsa dushanbaga; haftalik — shu haftaga; oylik — shu oyga), muddati ham
// suriladi, carry_count +1.
//
// Cloud Scheduler (00:10 Asia/Tashkent):
//   gcloud scheduler jobs create http goals-rollover-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="10 0 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/goals-rollover" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

type Summary = { first_name: string | null; last_name: string | null; total: number; done: number };

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = tashkentDayKey();
  const yKey = addDaysToKey(today, -1);

  // 1) Rahbar uchun xulosa (kecha).
  let summarized = 0;
  try {
    const rows = await sql<Summary[]>`
      select p.first_name, p.last_name, count(*)::int as total, count(*) filter (where g.done)::int as done
      from goals g join profiles p on p.id = g.user_id
      where g.scope = 'day' and g.period_key = ${yKey} and p.is_active
      group by p.id, p.first_name, p.last_name
      order by count(*) filter (where g.done)::float / count(*) desc, p.first_name`;
    if (rows.length) {
      const sumDone = rows.reduce((a, r) => a + r.done, 0);
      const sumTotal = rows.reduce((a, r) => a + r.total, 0);
      const lines = rows.map((r) => {
        const name = escapeTelegramText(`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Nomsiz');
        const icon = r.done >= r.total ? '✅' : r.done === 0 ? '❌' : '⚠️';
        return `${icon} ${name} — ${r.done}/${r.total} · ${Math.round((r.done / r.total) * 100)}%`;
      });
      const text = [
        `🎯 <b>Kunlik maqsadlar — xodimlar</b>`,
        `🗓 ${formatDayUz(yKey)}`,
        '',
        `<b>Jami: ${sumDone} / ${sumTotal} · ${Math.round((sumDone / sumTotal) * 100)}%</b> · ${rows.length} xodim`,
        progressBar(sumDone, sumTotal),
        '',
        ...lines,
        '',
        'Bajarilmaganlar keyingi ish kuniga avtomatik o‘tdi.',
      ].join('\n');
      const ceos = await sql<{ telegram_id: string | null }[]>`
        select telegram_id from profiles
        where is_active and (role = 'ceo' or exists (select 1 from profile_roles r where r.user_id = profiles.id and r.role = 'ceo'))`;
      await sendTelegramManyAs('report', ceos.map((c) => c.telegram_id), text, { record: false });
      summarized = rows.length;
    }
  } catch (error) {
    // The summary must never stop the rollover itself.
    console.error('[goals-rollover] summary failed', error instanceof Error ? error.message : error);
  }

  // 2) Ko'chirish.
  const keys = periodKeysFor(today);
  const target: Record<GoalScope, string> = { day: workingDay(today), week: keys.week, month: keys.month };
  const open = await sql<{ id: string; scope: GoalScope; period_key: string; due_date: string | null }[]>`
    select id, scope, period_key, to_char(due_date, 'YYYY-MM-DD') as due_date
    from goals
    where not done and (
      (scope = 'day' and period_key < ${target.day}) or
      (scope = 'week' and period_key < ${target.week}) or
      (scope = 'month' and period_key < ${target.month}))`;

  let moved = 0;
  for (const g of open) {
    const to = target[g.scope];
    try {
      const res = await sql`
        update goals set period_key = ${to}, due_date = ${shiftDue(g.scope, g.due_date, g.period_key, to)},
          carry_count = carry_count + 1, moved_from = null, reminded_at = null
        where id = ${g.id} and not done and period_key = ${g.period_key}`;
      moved += res.count;
    } catch (error) {
      console.error('[goals-rollover] move failed', g.id, error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({ ok: true, day: today, summarized, moved, open: open.length });
}

export const GET = withCronLog('goals-rollover', handle);
