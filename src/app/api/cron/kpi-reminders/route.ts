import { NextRequest, NextResponse } from 'next/server';
import { remindRiskReviews } from '@/lib/perforce-reminders';
import { pruneNotifications } from '@/lib/notifications';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramAs } from '@/lib/telegram';
import { tashkentDayKey, tashkentDayOfWeek, tashkentMonthKey, tashkentYmd } from '@/lib/time';
import { weekOf } from '@/lib/strategy-plan';
import { monthName, shiftMonth } from '@/lib/kpi-plan';

// My KPI reminders. Cloud Scheduler hits this once a day (Bearer CRON_SECRET):
//
//   gcloud scheduler jobs create http kpi-reminders-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 10 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/kpi-reminders" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"
//
//  - from 5 days before month end: employees without a submitted plan for
//    next month get a nudge (once);
//  - on the last day: a final "today 23:59" nudge (once);
//  - on the 1st: the CEO gets the list of who still has no plan for the
//    month that just started (once).
// kpi_reminders dedupes, so a missed or repeated run never double-sends.

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const thisMonth = `${tashkentMonthKey()}-01`;
  const next = shiftMonth(thisMonth, 1);
  const { year, month, day } = tashkentYmd();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const sent: string[] = [];

  /** Claims a reminder slot; false if it already went out. */
  const claim = async (m: string, kind: 'early' | 'last' | 'digest' | 'midmonth' | 'okr_checkin') =>
    (await sql`insert into kpi_reminders (month, kind) values (${m}, ${kind}) on conflict do nothing`).count === 1;

  /** Active staff (not the CEO) with no submitted / approved plan for `m`. */
  const missing = (m: string) => sql<{ first_name: string; last_name: string; telegram_id: number | null }[]>`
    select p.first_name, p.last_name, p.telegram_id from profiles p
    where p.is_active and p.role <> 'ceo'
      and not exists (select 1 from kpi_plans k where k.user_id = p.id and k.month = ${m} and k.status in ('submitted', 'approved'))
    order by p.first_name`;

  const last = day === lastDay;
  if (day >= lastDay - 5 && (await claim(next, last ? 'last' : 'early'))) {
    const text = last
      ? `⏰ Bugun 23:59 gacha <b>${monthName(next)}</b> KPI rejangizni topshirishingiz shart.\nPlatforma › Mening KPI`
      : `📝 <b>${monthName(next)}</b> KPI rejasini topshirish vaqti keldi — muddat: oyning oxirgi kuni, 23:59.\nUch ssenariy: yomon, yaxshi, juda yaxshi. Platforma › Mening KPI`;
    for (const p of await missing(next)) {
      if (!p.telegram_id) continue;
      await sendTelegramAs('kpi', p.telegram_id, text).catch(() => {});
    }
    sent.push(last ? 'last' : 'early');
  }

  if (day === 1 && (await claim(thisMonth, 'digest'))) {
    const rows = await missing(thisMonth);
    const ceos = await sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles where is_active and role = 'ceo' and telegram_id is not null`;
    const text = rows.length
      ? `📋 <b>${monthName(thisMonth)}</b> KPI rejasini topshirmaganlar (${rows.length}):\n` +
        rows.map((r) => `• ${escapeTelegramText(`${r.first_name} ${r.last_name}`)}`).join('\n')
      : `✅ ${monthName(thisMonth)}: hamma KPI rejasini topshirdi.`;
    for (const c of ceos) await sendTelegramAs('kpi', c.telegram_id!, text).catch(() => {});
    sent.push('digest');
  }

  // Mid-month check-in: everyone with an approved plan is reminded of their
  // "Yaxshi" targets while there is still half a month to act.
  if (day === 15 && (await claim(thisMonth, 'midmonth'))) {
    const rows = await sql<{ telegram_id: number; items: { title: string; target_good: string; unit: string }[] }[]>`
      select p.telegram_id,
        coalesce((select json_agg(json_build_object('title', i.title, 'target_good', i.target_good, 'unit', i.unit) order by i.sort_order)
                  from kpi_items i where i.plan_id = k.id), '[]'::json) as items
      from kpi_plans k join profiles p on p.id = k.user_id
      where k.month = ${thisMonth} and k.status = 'approved' and p.is_active and p.telegram_id is not null`;
    for (const r of rows) {
      const lines = r.items
        .filter((i) => i.target_good)
        .slice(0, 6)
        .map((i) => `• ${escapeTelegramText(i.title)}: <b>${escapeTelegramText(i.target_good)}</b> ${escapeTelegramText(i.unit)}`);
      const text =
        `🧭 Oy yarmi — <b>${monthName(thisMonth)}</b> KPI'ingiz qayerda?\n` +
        (lines.length ? `“Yaxshi” maqsadlaringiz:\n${lines.join('\n')}\n` : '') +
        `Oy oxirigacha 2 hafta bor. Platforma › Mening KPI`;
      await sendTelegramAs('kpi', r.telegram_id, text).catch(() => {});
    }
    sent.push('midmonth');
  }

  // Strategy OKRs: on Friday, owners of active key results with no check-in
  // this week get one nudge listing them.
  const week = weekOf(tashkentDayKey());
  if (tashkentDayOfWeek() === 5 && (await claim(week, 'okr_checkin').catch(() => false))) {
    const rows = await sql<{ telegram_id: number; titles: string[] }[]>`
      select p.telegram_id, array_agg(k.title order by k.title) as titles
      from strategy_key_results k
      join strategy_objectives o on o.id = k.objective_id and o.status = 'active'
      join profiles p on p.id = coalesce(k.owner_id, o.owner_id)
      where p.is_active and p.telegram_id is not null
        and not exists (select 1 from strategy_checkins c where c.kr_id = k.id and c.week = ${week})
      group by p.telegram_id`.catch(() => []);
    for (const r of rows) {
      const list = r.titles.slice(0, 8).map((t) => `• ${escapeTelegramText(t)}`).join('\n');
      await sendTelegramAs('kpi', 
        r.telegram_id,
        `🎯 Haftalik OKR check-in: quyidagi key result’lar bo‘yicha bu hafta holat kiritilmagan:\n${list}\nPlatforma › Strategiya › OKR`,
      ).catch(() => {});
    }
    sent.push('okr_checkin');
  }

  // Perforce: risks whose review date has come (once a week per risk).
  const riskNudges = await remindRiskReviews().catch((error) => {
    console.error('remindRiskReviews failed', error instanceof Error ? error.message : error);
    return 0;
  });
  // Bildirishnomalar: 90-day retention.
  const pruned = await pruneNotifications().catch(() => 0);
  return NextResponse.json({ ok: true, sent, riskNudges, pruned });
}

export const GET = withCronLog('kpi-reminders', handle);
