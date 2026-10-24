import { NextRequest, NextResponse } from 'next/server';
import { withCronLog } from '@/lib/cron-log';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';
import { addDaysToKey, tashkentDayKey } from '@/lib/time';
import { isTeacherRole, teacherIdsWithLessonOn } from '@/lib/teacher-schedule';

// Kunlik checklist hisoboti. Yangi kun boshlanganda (Toshkent 00:05) KECHAGI
// kunning bajarilishini barcha xodim bo'yicha jamlab, Telegram guruhiga (va
// CEO'ga) yuboradi. Masalan Seshanba 00:05 da Dushanba hisoboti keladi.
//
// Ustozlar (teacher/head_teacher/assistant): kechagi kuni darsi bo'lmagan
// bo'lsa, ularda kunlik checklist talab qilinmaydi — hisobotda "dars yo'q"
// deb belgilanadi, ratio hisobiga kirmaydi (lesson-plan bilan integratsiya).
//
// Cloud Scheduler (00:05 Asia/Tashkent):
//   gcloud scheduler jobs create http checklist-report-daily \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="5 0 * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/checklist-report" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>"

const WEEKDAYS_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

function formatDay(dayKey: string): string {
  const [y, m, d] = dayKey.split('-');
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay();
  return `${d}.${m}.${y}, ${WEEKDAYS_UZ[dow]}`;
}

type Row = { id: string; first_name: string | null; last_name: string | null; role: string; total: number; done: number };

async function handle(req: NextRequest): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Kecha (Toshkent) — hisobot shu kun uchun.
  const yKey = addDaysToKey(tashkentDayKey(), -1);

  const pinnedChatIds = (process.env.TELEGRAM_REPORT_CHAT_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);

  const [rows, ceoProfiles, groupChats, teacherLessonIds] = await Promise.all([
    sql<Row[]>`
      select p.id, p.first_name, p.last_name, p.role,
        coalesce(tt.total, 0)::int as total,
        coalesce(dd.done, 0)::int as done
      from profiles p
      left join (
        select role, count(*) as total from checklist_templates
        where cadence = 'daily' and active group by role
      ) tt on tt.role = p.role
      left join (
        select t.role, k.user_id, count(*) as done
        from checklist_template_ticks k
        join checklist_templates t on t.id = k.template_id
        where k.period_key = ${yKey} and t.cadence = 'daily' and t.active
        group by t.role, k.user_id
      ) dd on dd.user_id = p.id and dd.role = p.role
      where p.is_active = true
      order by p.first_name, p.last_name
    `.catch(() => []),
    sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where (role = 'ceo' or exists (select 1 from profile_roles r where r.user_id = profiles.id and r.role = 'ceo'))`,
    pinnedChatIds.length > 0
      ? Promise.resolve(pinnedChatIds.map((chat_id) => ({ chat_id })))
      : sql<{ chat_id: number }[]>`select chat_id from telegram_group_chats`.catch(() => []),
    teacherIdsWithLessonOn(yKey),
  ]);

  const name = (r: Row) => escapeTelegramText(`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Nomsiz');

  const full: string[] = [];
  const partial: string[] = [];
  const none: string[] = [];
  const noLesson: string[] = [];

  for (const r of rows) {
    // Checklist biriktirilmagan rollar (total=0) — hisobotga kirmaydi.
    if (r.total === 0) continue;
    // Ustozda kecha dars bo'lmasa — talab qilinmaydi.
    if (isTeacherRole(r.role) && !teacherLessonIds.has(r.id)) {
      noLesson.push(`• ${name(r)}`);
      continue;
    }
    const line = `• ${name(r)} — ${r.done}/${r.total}`;
    if (r.done >= r.total) full.push(line);
    else if (r.done === 0) none.push(line);
    else partial.push(line);
  }

  const counted = full.length + partial.length + none.length;
  if (counted === 0 && noLesson.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no-employees', day: yKey });
  }

  const parts: string[] = [
    `📋 <b>Kunlik checklist hisoboti</b>`,
    `🗓 ${formatDay(yKey)}`,
    `\n<b>Jami:</b> ${counted} xodim · ✅ ${full.length} · ⚠️ ${partial.length} · ❌ ${none.length}`,
  ];
  if (full.length) parts.push(`\n✅ <b>To‘liq bajarganlar</b>\n${full.join('\n')}`);
  if (partial.length) parts.push(`\n⚠️ <b>Qisman bajarganlar</b>\n${partial.join('\n')}`);
  if (none.length) parts.push(`\n❌ <b>Boshlamaganlar</b>\n${none.join('\n')}`);
  if (noLesson.length) parts.push(`\n💤 <b>Dars yo‘q (ustozlar)</b>\n${noLesson.join('\n')}`);

  const text = parts.join('\n');

  const recipientChatIds = [...ceoProfiles.map((c) => c.telegram_id), ...groupChats.map((g) => g.chat_id)];
  await sendTelegramManyAs('report', recipientChatIds, text, { record: false });

  return NextResponse.json({
    ok: true,
    day: yKey,
    full: full.length,
    partial: partial.length,
    none: none.length,
    noLesson: noLesson.length,
    recipients: recipientChatIds.filter(Boolean).length,
  });
}

export const GET = withCronLog('checklist-report', handle);
