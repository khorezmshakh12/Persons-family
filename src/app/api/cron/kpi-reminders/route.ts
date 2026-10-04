import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { tashkentMonthKey, tashkentYmd } from '@/lib/time';
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

export async function GET(req: NextRequest) {
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
  const claim = async (m: string, kind: 'early' | 'last' | 'digest') =>
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
      await sendTelegramMessage(p.telegram_id, text).catch(() => {});
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
    for (const c of ceos) await sendTelegramMessage(c.telegram_id!, text).catch(() => {});
    sent.push('digest');
  }

  return NextResponse.json({ ok: true, sent });
}
