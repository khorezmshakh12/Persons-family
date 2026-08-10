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

  // "Odd/even days" is a weekday rotation (Mon/Wed/Fri vs Tue/Thu/Sat), not
  // calendar-date-of-month parity — those two only agree on some days and
  // silently drift apart on others (e.g. any week containing a Sunday),
  // which used to make this check both flag groups with no class that day
  // and skip the groups that actually had one. getUTCDay(): Mon=1, Wed=3,
  // Fri=5 are odd; Tue=2, Thu=4, Sat=6 are even; Sun=0 is already handled
  // above.
  const parity: 'odd' | 'even' = checkDate.getUTCDay() % 2 === 1 ? 'odd' : 'even';

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
    .select('group_id, topic, aim, language_focus, anticipated_problems, homework')
    .in(
      'group_id',
      groups.map((g) => g.id),
    )
    .eq('lesson_date', dateKey);

  const lessonByGroup = new Map((lessons ?? []).map((l) => [l.group_id, l]));

  type GroupStatus = { groupName: string; status: 'complete' | 'missing' | 'incomplete' };
  const byTeacher = new Map<string, { teacherName: string; groups: GroupStatus[] }>();

  for (const group of groups) {
    const lesson = lessonByGroup.get(group.id);
    const status: GroupStatus['status'] =
      lesson && isLessonPlanComplete(lesson) ? 'complete' : lesson ? 'incomplete' : 'missing';

    const teacherName = group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : "Noma'lum";
    const entry = byTeacher.get(group.teacher_id) ?? { teacherName, groups: [] };
    entry.groups.push({ groupName: group.name, status });
    byTeacher.set(group.teacher_id, entry);
  }

  // Two renderings of the same data: `summary` is plain text for the
  // in-app bell (React escapes it as text, so it must not contain markup),
  // `telegramText` adds Telegram's HTML formatting on top. The bell alert
  // stays gap-only by design (see lesson_plan_compliance_alerts' migration
  // comment: a fully-compliant day inserts nothing so the CEO's bell only
  // lights up when there's something to review) — but the group's Telegram
  // report lists every teacher, completed groups included, so "who did
  // their lesson plans today" is visible there too, not just who didn't.
  const gapPlainLines: string[] = [];
  const completedLines: string[] = [];
  const gapLines: string[] = [];
  let incompleteTeachers = 0;

  for (const { teacherName, groups: groupStatuses } of byTeacher.values()) {
    const completed = groupStatuses.filter((g) => g.status === 'complete');
    const gaps = groupStatuses.filter((g) => g.status !== 'complete');

    if (completed.length > 0) {
      const doneText = completed.map((g) => g.groupName).join(', ');
      completedLines.push(`✅ <b>${escapeTelegramText(teacherName)}</b>: ${escapeTelegramText(doneText)}`);
    }

    if (gaps.length > 0) {
      incompleteTeachers += 1;
      const gapText = gaps
        .map((g) => `${g.groupName} (${g.status === 'missing' ? 'yozilmagan' : "to'liq emas"})`)
        .join(', ');
      gapPlainLines.push(`${teacherName}: ${gapText}`);
      gapLines.push(`❗ <b>${escapeTelegramText(teacherName)}</b>: ${escapeTelegramText(gapText)}`);
    }
  }

  const telegramLines = [`📋 Kunlik lesson plan hisoboti — ${dateKey}`, ''];
  if (completedLines.length > 0) telegramLines.push(...completedLines);
  if (gapLines.length > 0) {
    if (completedLines.length > 0) telegramLines.push('');
    telegramLines.push(...gapLines);
  }
  if (incompleteTeachers === 0) {
    telegramLines.push('', "✅ Barcha ustozlar kunlik lesson planlarini to'liq yozishgan.");
  }
  const telegramText = telegramLines.join('\n');

  await sendTelegramMessageToMany(recipientChatIds, telegramText);

  if (incompleteTeachers > 0) {
    const summary = gapPlainLines.join('\n');
    await admin.from('lesson_plan_compliance_alerts').insert({ report_date: dateKey, summary });
  }

  return { checkedGroups: groups.length, incompleteTeachers };
}

// materials and procedure are intentionally not required here — teachers
// only need to fill topic, aim, language_focus, anticipated_problems and
// homework for a plan to count as complete.
function isLessonPlanComplete(lesson: {
  topic: string | null;
  aim: string | null;
  language_focus: string | null;
  anticipated_problems: string | null;
  homework: string | null;
}): boolean {
  return Boolean(
    lesson.topic?.trim() &&
      lesson.aim?.trim() &&
      lesson.language_focus?.trim() &&
      lesson.anticipated_problems?.trim() &&
      lesson.homework?.trim(),
  );
}
