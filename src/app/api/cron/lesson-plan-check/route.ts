import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';

// Vercel Cron (see vercel.json, "0 19 * * *" UTC = 00:00 Asia/Tashkent, no
// DST) hits this once a day right as the deadline day rolls over. Teachers
// must have every field of a scheduled group's lesson plan filled in by
// 23:59 the day of — this route finds who didn't and tells the CEO, both
// as a Telegram message and an in-app bell alert
// (lesson_plan_compliance_alerts, see that migration's comment).
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // "Today" for this run is the Tashkent-local date the moment the cron
  // fires (00:00) — the deadline day that just closed is the one before it.
  const tashkentTodayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const checkDate = new Date(`${tashkentTodayKey}T00:00:00Z`);
  checkDate.setUTCDate(checkDate.getUTCDate() - 1);
  const dateKey = checkDate.toISOString().slice(0, 10);
  const parity: 'odd' | 'even' = checkDate.getUTCDate() % 2 === 1 ? 'odd' : 'even';

  // schedule_type is nullable; `.eq()` never matches null, so groups with
  // no defined odd/even schedule are excluded — we simply can't know
  // whether they had class on `dateKey`.
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, teacher_id, teacher:profiles!groups_teacher_id_fkey(first_name, last_name)')
    .eq('schedule_type', parity);

  const { data: ceoProfiles } = await admin.from('profiles').select('telegram_id').eq('role', 'ceo');
  const ceoTelegramIds = (ceoProfiles ?? []).map((c) => c.telegram_id);

  if (!groups || groups.length === 0) {
    return NextResponse.json({ ok: true, dateKey, checkedGroups: 0, incompleteTeachers: 0 });
  }

  const { data: lessons } = await admin
    .from('course_lessons')
    .select('group_id, topic, aim, language_focus, anticipated_problems, materials, homework, procedure')
    .in(
      'group_id',
      groups.map((g) => g.id),
    )
    .eq('lesson_date', dateKey);

  const lessonByGroup = new Map((lessons ?? []).map((l) => [l.group_id, l]));

  type Gap = { groupName: string; reason: 'missing' | 'incomplete' };
  const byTeacher = new Map<string, { teacherName: string; gaps: Gap[] }>();

  for (const group of groups) {
    const lesson = lessonByGroup.get(group.id);
    if (lesson && isLessonPlanComplete(lesson)) continue;

    const teacherName = group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : "Noma'lum";
    const entry = byTeacher.get(group.teacher_id) ?? { teacherName, gaps: [] };
    entry.gaps.push({ groupName: group.name, reason: lesson ? 'incomplete' : 'missing' });
    byTeacher.set(group.teacher_id, entry);
  }

  if (byTeacher.size === 0) {
    // A confirmation, not silence, so "nothing happened" is distinguishable
    // from "the cron never ran" — matches every other automated report in
    // this app always producing a visible signal.
    await sendTelegramMessageToMany(
      ceoTelegramIds,
      `✅ <b>${escapeTelegramText(dateKey)}</b> — barcha ustozlar kunlik lesson planlarini to'liq yozishgan.`,
    );
    return NextResponse.json({ ok: true, dateKey, checkedGroups: groups.length, incompleteTeachers: 0 });
  }

  // Two renderings of the same data: `summary` is plain text for the
  // in-app bell (React escapes it as text, so it must not contain markup),
  // `telegramText` adds Telegram's HTML formatting on top.
  const plainLines: string[] = [];
  const telegramLines = [`📋 Kunlik lesson plan hisoboti — ${dateKey}`, ''];
  for (const { teacherName, gaps } of byTeacher.values()) {
    const gapText = gaps
      .map((g) => `${g.groupName} (${g.reason === 'missing' ? 'yozilmagan' : "to'liq emas"})`)
      .join(', ');
    plainLines.push(`${teacherName}: ${gapText}`);
    telegramLines.push(`❗ <b>${escapeTelegramText(teacherName)}</b>: ${escapeTelegramText(gapText)}`);
  }
  const summary = plainLines.join('\n');
  const telegramText = telegramLines.join('\n');

  await sendTelegramMessageToMany(ceoTelegramIds, telegramText);
  await admin.from('lesson_plan_compliance_alerts').insert({ report_date: dateKey, summary });

  return NextResponse.json({ ok: true, dateKey, checkedGroups: groups.length, incompleteTeachers: byTeacher.size });
}

function isLessonPlanComplete(lesson: {
  topic: string | null;
  aim: string | null;
  language_focus: string | null;
  anticipated_problems: string | null;
  materials: string | null;
  homework: string | null;
  procedure: unknown;
}): boolean {
  const procedure = Array.isArray(lesson.procedure) ? lesson.procedure : [];
  return Boolean(
    lesson.topic?.trim() &&
      lesson.aim?.trim() &&
      lesson.language_focus?.trim() &&
      lesson.anticipated_problems?.trim() &&
      lesson.materials?.trim() &&
      lesson.homework?.trim() &&
      procedure.length > 0,
  );
}
