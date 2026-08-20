import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramMessageToMany } from '@/lib/telegram';
import { bumpSignal } from '@/lib/gcp/firestoreAdmin';

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

  // The Tashkent-local date the moment the cron fires *is* the day whose
  // plan-in-advance deadline (23:59 the night before) just passed — that's
  // the most recent day there's anything to check.
  const tashkentTodayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  const latestCheckable = new Date(`${tashkentTodayKey}T00:00:00Z`);

  const [lastRun] = await sql<{ date_key: string }[]>`
    select date_key from lesson_plan_cron_runs order by date_key desc limit 1
  `;

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

  const [ceoProfiles, groupChats] = await Promise.all([
    sql<{ telegram_id: number | null }[]>`select telegram_id from profiles where role = 'ceo'`,
    sql<{ chat_id: number }[]>`select chat_id from telegram_group_chats`,
  ]);
  const recipientChatIds = [...ceoProfiles.map((c) => c.telegram_id), ...groupChats.map((g) => g.chat_id)];

  const results = [];
  for (const dateKey of dateKeys) {
    const result = await checkOneDay(dateKey, recipientChatIds);
    await sql`
      insert into lesson_plan_cron_runs (date_key) values (${dateKey})
      on conflict (date_key) do nothing
    `;
    results.push({ dateKey, ...result });
  }

  return NextResponse.json({ ok: true, checked: results });
}

async function checkOneDay(dateKey: string, recipientChatIds: (number | null)[]) {
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

  // schedule_type is nullable; a plain equality check never matches null,
  // so groups with no defined odd/even schedule are excluded — we simply
  // can't know whether they had class on `dateKey`.
  const groups = await sql<
    { id: string; name: string; teacher_id: string; teacher_first_name: string | null; teacher_last_name: string | null }[]
  >`
    select g.id, g.name, g.teacher_id, t.first_name as teacher_first_name, t.last_name as teacher_last_name
    from groups g
    left join profiles t on t.id = g.teacher_id
    where g.schedule_type = ${parity}
  `;

  if (groups.length === 0) {
    return { checkedGroups: 0, incompleteTeachers: 0 };
  }

  const groupIds = groups.map((g) => g.id);
  const lessons = await sql<
    {
      group_id: string;
      topic: string | null;
      aim: string | null;
      language_focus: string | null;
      anticipated_problems: string | null;
      homework: string | null;
    }[]
  >`
    select group_id, topic, aim, language_focus, anticipated_problems, homework
    from course_lessons
    where group_id in ${sql(groupIds)} and lesson_date = ${dateKey}
  `;

  // A group can end up with more than one course_lessons row landing on the
  // same date (e.g. a teacher re-dates a different lesson_number onto a day
  // that already has one filled in). There's no ordering guarantee from
  // Postgres without ORDER BY, so picking "the" row for a group by just
  // overwriting a Map entry was non-deterministic — a stray empty duplicate
  // could silently shadow the teacher's actually-completed one and get
  // reported as missing/incomplete. Keep every row per group and count the
  // group as done if any one of them is complete.
  const lessonsByGroup = new Map<string, (typeof lessons)[number][]>();
  for (const lesson of lessons) {
    const bucket = lessonsByGroup.get(lesson.group_id) ?? [];
    bucket.push(lesson);
    lessonsByGroup.set(lesson.group_id, bucket);
  }

  type GroupStatus = { groupName: string; status: 'complete' | 'missing' | 'incomplete' };
  const byTeacher = new Map<string, { teacherName: string; groups: GroupStatus[] }>();

  for (const group of groups) {
    const groupLessons = lessonsByGroup.get(group.id) ?? [];
    const status: GroupStatus['status'] =
      groupLessons.length === 0 ? 'missing' : groupLessons.some(isLessonPlanComplete) ? 'complete' : 'incomplete';

    const teacherName = group.teacher_first_name ? `${group.teacher_first_name} ${group.teacher_last_name}` : "Noma'lum";
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
    await sql`insert into lesson_plan_compliance_alerts (report_date, summary) values (${dateKey}, ${summary})`;
    // Live-pushes the CEO's bell (see notification-bell.tsx, which listens
    // to this same signal path alongside its own nav_badge_signals/{uid}).
    await bumpSignal('board_signals/lesson_plan_alerts');
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
