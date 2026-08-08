import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';

type AdminClient = ReturnType<typeof createAdminClient>;

// A run that's this far behind (e.g. the cron was broken for weeks) only
// catches up this many most-recent days rather than replaying the whole gap
// in one burst.
const MAX_CATCHUP_DAYS = 7;

// Vercel Cron (see vercel.json, "0 19 * * *" UTC = 00:00 Asia/Tashkent, no
// DST) hits this once a day right as a new day rolls over. Teachers must
// have every field of the *next* day's lesson plan filled in by 23:59 the
// night before — so the day whose deadline just passed is the one that's
// just starting, not the one that just ended. This route checks that day
// and tells the CEO (and the team's Telegram group) who didn't, both as a
// Telegram message and, for the CEO, an in-app bell alert
// (lesson_plan_compliance_alerts, see that migration's comment).
//
// A single missed trigger (a deploy landing right at 00:00 Tashkent can
// drop that invocation, or Vercel's own cron scheduling can occasionally
// skip a beat) used to mean that day's compliance was never checked at
// all — the report just showed up "a day late" on the next run instead,
// covering the wrong date. lesson_plan_cron_runs now records every
// date_key actually processed, so each run catches up on anything since
// the last one instead of only ever looking at the single most recent day.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // The Tashkent-local date the moment the cron fires *is* the day whose
  // plan-in-advance deadline (23:59 the night before) just passed — that's
  // the most recent day there's anything to check.
  const tashkentTodayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const latestCheckable = new Date(`${tashkentTodayKey}T00:00:00Z`);

  const { data: lastRun } = await admin
    .from('lesson_plan_cron_runs')
    .select('date_key')
    .order('date_key', { ascending: false })
    .limit(1)
    .maybeSingle();

  const start = new Date(latestCheckable);
  if (lastRun) {
    start.setTime(new Date(`${lastRun.date_key}T00:00:00Z`).getTime());
    start.setUTCDate(start.getUTCDate() + 1);
    const earliestAllowed = new Date(latestCheckable);
    earliestAllowed.setUTCDate(earliestAllowed.getUTCDate() - (MAX_CATCHUP_DAYS - 1));
    if (start.getTime() < earliestAllowed.getTime()) start.setTime(earliestAllowed.getTime());
  }

  const dateKeys: string[] = [];
  for (const d = new Date(start); d.getTime() <= latestCheckable.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    dateKeys.push(d.toISOString().slice(0, 10));
  }

  if (dateKeys.length === 0) {
    return NextResponse.json({ ok: true, checked: [] });
  }

  const [{ data: ceoProfiles }, { data: groupChats }] = await Promise.all([
    admin.from('profiles').select('telegram_id').eq('role', 'ceo'),
    admin.from('telegram_group_chats').select('chat_id'),
  ]);
  const recipientChatIds = [
    ...(ceoProfiles ?? []).map((c) => c.telegram_id),
    ...(groupChats ?? []).map((g) => g.chat_id),
  ];

  const results = [];
  for (const dateKey of dateKeys) {
    const result = await checkOneDay(admin, dateKey, recipientChatIds);
    await admin.from('lesson_plan_cron_runs').upsert({ date_key: dateKey }, { onConflict: 'date_key' });
    results.push({ dateKey, ...result });
  }

  return NextResponse.json({ ok: true, checked: results });
}

async function checkOneDay(admin: AdminClient, dateKey: string, recipientChatIds: (number | null)[]) {
  const checkDate = new Date(`${dateKey}T00:00:00Z`);

  // The center runs a 6-day week — nobody has class on Sunday regardless of
  // their odd/even rotation, so there's nothing to check or alert on.
  // getUTCDay() is safe here because dateKey is already the Tashkent-local
  // calendar date; which weekday a Y-M-D falls on doesn't depend on the
  // time-of-day it's anchored to.
  if (checkDate.getUTCDay() === 0) {
    return { checkedGroups: 0, incompleteTeachers: 0, skipped: 'sunday' as const };
  }

  const parity: 'odd' | 'even' = checkDate.getUTCDate() % 2 === 1 ? 'odd' : 'even';

  // schedule_type is nullable; `.eq()` never matches null, so groups with
  // no defined odd/even schedule are excluded — we simply can't know
  // whether they had class on `dateKey`.
  const { data: groups } = await admin
    .from('groups')
    .select('id, name, teacher_id, teacher:profiles!groups_teacher_id_fkey(first_name, last_name)')
    .eq('schedule_type', parity);

  if (!groups || groups.length === 0) {
    return { checkedGroups: 0, incompleteTeachers: 0 };
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
      recipientChatIds,
      `✅ <b>${escapeTelegramText(dateKey)}</b> — barcha ustozlar kunlik lesson planlarini to'liq yozishgan.`,
    );
    return { checkedGroups: groups.length, incompleteTeachers: 0 };
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

  await sendTelegramMessageToMany(recipientChatIds, telegramText);
  await admin.from('lesson_plan_compliance_alerts').insert({ report_date: dateKey, summary });

  return { checkedGroups: groups.length, incompleteTeachers: byTeacher.size };
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
