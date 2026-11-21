import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { CAP_ROLES } from '@/lib/permissions';
import { notifyUsers } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { EMPTY_ROADMAP, stagePhases, type GrowthRoadmap, type StageReview } from '@/lib/hr-growth';
import { fmtDayKey } from '@/lib/hr-leave';

// HR eslatmalari (har kuni 09:00 Toshkent):
//  - Roadmap: joriy bosqich muddatiga ≤ 3 kun qolganda va muddat o'tganda
//    xodimga bir martadan (hr_growth.reminded = {stageId: "<due>:soon|late"}).
//  - Tasdiq kutayotganlar: CEO'ga roadmap bosqichlari + lavozim so'rovlari,
//    ta'til tasdiqlovchilarga 1 kundan ortiq kutayotgan ta'til so'rovlari.
//
// Cloud Scheduler:
//   gcloud scheduler jobs create http hr-reminders \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 9 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/hr-reminders" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

async function holders(roles: readonly string[]): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select distinct p.id from profiles p left join profile_roles r on r.user_id = p.id
    where p.is_active and (p.role::text in ${sql([...roles])} or r.role::text in ${sql([...roles])})`;
  return rows.map((r) => r.id);
}

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const today = tashkentDayKey();
  const soon = addDaysToKey(today, 3);

  // 1) Roadmap deadlines — the employee's own draft (their working copy).
  const plans = await sql<{ user_id: string; roadmap: GrowthRoadmap | null; stage_state: Record<string, StageReview> | null; reminded: Record<string, string> | null }[]>`
    select g.user_id, g.roadmap, g.stage_state, g.reminded from hr_growth g join profiles p on p.id = g.user_id where p.is_active`;
  let growthSent = 0;
  for (const g of plans) {
    const r = g.roadmap?.sections ? g.roadmap : EMPTY_ROADMAP;
    const phases = stagePhases(r, g.stage_state ?? {});
    const st = r.sections.find((s) => phases[s.id] === 'current');
    if (!st?.due || st.due > soon) continue;
    const mark = `${st.due}:${st.due < today ? 'late' : 'soon'}`;
    if (g.reminded?.[st.id] === mark) continue;
    // Claim first so an overlapping run can't double-send.
    const res = await sql`
      update hr_growth set reminded = coalesce(reminded, '{}'::jsonb) || ${sql.json({ [st.id]: mark })}
      where user_id = ${g.user_id} and coalesce(reminded->>${st.id}, '') <> ${mark}`;
    if (res.count === 0) continue;
    const text =
      st.due < today
        ? `⏰ Roadmap: «${st.t}» bosqichi muddati o‘tdi (${fmtDayKey(st.due)}). Bandlarni yakunlab, «Bosqichni yakunladim»ni bosing yoki muddatni yangilang.`
        : `📅 Roadmap: «${st.t}» bosqichi muddatiga oz qoldi — ${fmtDayKey(st.due)}.`;
    await notifyUsers('goals', [g.user_id], text, { href: '/hr?tab=growth' }).catch(() => {});
    growthSent++;
  }

  // 2) Approval digest.
  const [{ positions }] = await sql<{ positions: number }[]>`select count(*)::int as positions from position_requests where status = 'pending'`;
  const sentPlans = await sql<{ sent_roadmap: GrowthRoadmap | null; stage_state: Record<string, StageReview> | null }[]>`
    select g.sent_roadmap, g.stage_state from hr_growth g join profiles p on p.id = g.user_id where p.is_active and g.sent_at is not null`;
  const stages = sentPlans.reduce((a, g) => {
    const r = g.sent_roadmap?.sections ? g.sent_roadmap : EMPTY_ROADMAP;
    return a + Object.values(stagePhases(r, g.stage_state ?? {})).filter((p) => p === 'waiting').length;
  }, 0);
  if (stages || positions) {
    const parts = [stages && `${stages} ta roadmap bosqichi`, positions && `${positions} ta lavozim so‘rovi`].filter(Boolean).join(', ');
    await notifyUsers('goals', await holders(['ceo']), `🗂 HR: ${parts} tasdiqingizni kutmoqda.`, { href: stages ? '/hr?tab=growth' : '/hr?tab=roadmap' }).catch(() => {});
  }
  const [{ leave }] = await sql<{ leave: number }[]>`
    select count(*)::int as leave from leave_requests where status = 'pending' and created_at < now() - interval '1 day'`;
  if (leave) {
    await notifyUsers('task', await holders(CAP_ROLES['leave.review']), `🌴 HR: ${leave} ta ta’til so‘rovi 1 kundan beri javob kutmoqda.`, { href: '/hr?tab=leave' }).catch(() => {});
  }

  return NextResponse.json({ ok: true, growthSent, stages, positions, leave });
}

export const GET = withCronLog('hr-reminders', handle);
