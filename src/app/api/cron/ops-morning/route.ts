import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { SECTION_ROLES } from '@/lib/permissions';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';
import { tashkentDayKey } from '@/lib/time';
import { weekdayParity } from '@/lib/teacher-schedule';
import { DEFAULT_DURATION, fmtMin, isBlocking, scheduleIssues, toMin, type SchedGroup } from '@/lib/ops-schedule';

// Operation HQ ertalabki xabari (2026-10-22): har kuni 08:00 da operatsiya
// bo'limiga (Operation HQ'ni ko'ra oladiganlar) bugungi darslar soni, birinchi
// va oxirgi dars, xonalar, ziddiyatlar va kalendardagi voqealar.
//
// Cloud Scheduler (08:00 Asia/Tashkent):
//   gcloud scheduler jobs create http ops-morning-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="0 8 * * 1-6" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/ops-morning" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

const WEEKDAYS_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const KIND_UZ: Record<string, string> = { holiday: '🎉 Bayram', exam: '📝 Imtihon', makeup: '🔁 Otrabotka', event: '📌 Tadbir' };

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const day = tashkentDayKey();
  const cohort = weekdayParity(day);
  if (!cohort) return NextResponse.json({ ok: true, skipped: 'sunday', day });

  const roles = [...SECTION_ROLES.operations] as string[];
  const [groups, rooms, availability, events, recipients] = await Promise.all([
    sql<(Omit<SchedGroup, 'cohort'> & { cohort: 'odd' | 'even' | null })[]>`
      select g.id, g.name, coalesce(g.course_name, '') as course, g.schedule_type as cohort,
        coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
        g.teacher_id, coalesce(p.first_name || ' ' || p.last_name, '') as teacher,
        coalesce((g.configuration->>'duration')::int, ${DEFAULT_DURATION}) as duration, e.enrolled
      from groups g left join profiles p on p.id = g.teacher_id
      left join ops_group_enrollment e on e.group_id = g.id`,
    sql<{ code: string; capacity: number }[]>`select code, capacity from ops_rooms`.catch(() => []),
    sql<{ teacher_id: string; cohort: 'odd' | 'even'; start: string; end: string }[]>`
      select teacher_id, cohort, start_time as start, end_time as end from ops_teacher_availability`.catch(() => []),
    sql<{ kind: string; title: string; time: string | null; room: string | null }[]>`
      select kind, title, time, room from ops_calendar where day = ${day} order by time nulls first`.catch(() => []),
    sql<{ telegram_id: number | null }[]>`
      select telegram_id from profiles p
      where p.is_active and p.telegram_id is not null
        and (p.role::text = any(${roles}) or exists (select 1 from profile_roles r where r.user_id = p.id and r.role::text = any(${roles})))`,
  ]);

  const holiday = events.find((e) => e.kind === 'holiday');
  const today = groups.filter((g) => g.cohort === cohort && g.time && g.room).sort((a, b) => toMin(a.time) - toMin(b.time));
  const capOf = (r: string) => rooms.find((x) => x.code === r)?.capacity ?? 12;
  const blocking = scheduleIssues(groups, capOf, availability).filter(isBlocking).filter((i) => today.some((g) => g.id === i.groupId));
  const teachers = new Set(today.map((g) => g.teacher_id).filter(Boolean));
  const usedRooms = new Set(today.map((g) => g.room));

  const parts: string[] = [`☀️ <b>Operatsiya · bugun</b>`, `🗓 ${day.split('-').reverse().join('.')}, ${WEEKDAYS_UZ[new Date(`${day}T00:00:00Z`).getUTCDay()]}`];
  if (holiday) parts.push(`\n🎉 <b>${escapeTelegramText(holiday.title)}</b> — bugun darslar yo‘q.`);
  else if (today.length === 0) parts.push('\nBugun jadvalda dars yo‘q.');
  else {
    const last = today.reduce((a, g) => Math.max(a, toMin(g.time) + g.duration), 0);
    parts.push(
      `\n📚 <b>${today.length}</b> ta dars · ${teachers.size} o‘qituvchi · ${usedRooms.size}/${rooms.length || usedRooms.size} xona`,
      `⏰ ${today[0].time} — ${fmtMin(last)}`,
    );
    parts.push(blocking.length ? `\n⚠️ <b>Ziddiyatlar: ${blocking.length}</b>\n${blocking.slice(0, 5).map((i) => `• ${escapeTelegramText(i.text)}`).join('\n')}` : '\n✅ Jadvalda ziddiyat yo‘q');
  }
  const rest = events.filter((e) => e !== holiday);
  if (rest.length)
    parts.push(`\n<b>Kalendar</b>\n${rest.map((e) => `${KIND_UZ[e.kind] ?? '📌'} ${escapeTelegramText(e.title)}${e.time ? ` · ${e.time}` : ''}${e.room ? ` · ${escapeTelegramText(e.room)}` : ''}`).join('\n')}`);
  parts.push('\nO‘qituvchilar davomatini HR › Davomat’da belgilang — kelmaganlar uchun o‘rinbosar Operation HQ › Bugun’da.');

  await sendTelegramManyAs('report', recipients.map((r) => r.telegram_id), parts.join('\n'), { record: false });
  return NextResponse.json({ ok: true, day, lessons: today.length, conflicts: blocking.length, recipients: recipients.length });
}

export const GET = withCronLog('ops-morning', handle);
