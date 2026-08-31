import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { sendTelegramMessage, sendTelegramMessageToMany } from '@/lib/telegram';
import {
  WEEKLY_EFFICIENCY_WARN_THRESHOLD,
  efficiencyForWeek,
  previousWeekWindow,
  type TaskLike,
} from '@/lib/task-efficiency';
import {
  REPORT_ROLE_GROUP_LABELS,
  REPORT_ROLE_GROUP_ORDER,
  formatEmployeeWarning,
  formatEmployeeWeekLine,
  formatRoleGroupReport,
  formatWeekLabel,
  reportRoleGroup,
  type ReportRoleGroup,
} from '@/lib/telegram-reports';

// Cloud Scheduler fires this every Monday at 06:00 Asia/Tashkent (see the
// gcloud command in this feature's report, and the lesson-plan-check-daily
// job for the identical CRON_SECRET bearer-auth pattern and the /staff
// basePath gotcha — the app is reverse-proxied under /staff, so the job's
// URI must include it).
//
// It scores the week that just finished (previousWeekWindow -> last
// Mon..Sun in Tashkent time; the container clock is UTC and must never be
// the reference) for every active employee, records the numbers in
// weekly_task_reports, DMs anyone under the efficiency threshold, and sends
// the CEO one consolidated message per role group.
//
// Re-running it for the same week is safe: the report rows are upserted on
// (user_id, week_start), so the numbers converge rather than duplicate. The
// Telegram sends are not deduplicated — a second run simply re-sends the
// same messages, which is preferable to a run that silently reports nothing
// after a partial failure.

type EmployeeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  // postgres-js returns bigint columns (profiles.telegram_id) as strings to
  // avoid silent precision loss — see sendTelegramMessageToMany's comment.
  telegram_id: string | number | null;
};

type TaskRow = TaskLike & { assigned_to: string | null };

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const week = previousWeekWindow();
  const weekLabel = formatWeekLabel(week.startKey, week.endKey);

  // The CEO and the IT developer are not scored — the CEO is the one being
  // reported to, and the IT developer lost task assignment entirely (see
  // requireTaskAssigner in lib/actions/tasks.ts).
  const [employees, tasks] = await Promise.all([
    sql<EmployeeRow[]>`
      select id, first_name, last_name, role, telegram_id
      from profiles
      where is_active = true and role not in ('ceo', 'it_developer')
      order by first_name asc, last_name asc
    `,
    // One query for the whole week rather than one per person; efficiencyForWeek
    // re-checks the window itself, so the bounds here are only an index-friendly
    // pre-filter (tasks_deadline_idx).
    sql<TaskRow[]>`
      select assigned_to, status, completed_at, deadline
      from tasks
      where deadline >= ${week.startsAt.toISOString()} and deadline < ${week.endsBefore.toISOString()}
    `,
  ]);

  const tasksByEmployee = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!task.assigned_to) continue;
    const bucket = tasksByEmployee.get(task.assigned_to) ?? [];
    bucket.push(task);
    tasksByEmployee.set(task.assigned_to, bucket);
  }

  type Scored = { name: string; efficiencyPct: number; notDone: number; line: string };
  const byGroup = new Map<ReportRoleGroup, Scored[]>();
  let warnedCount = 0;

  for (const employee of employees) {
    const name = [employee.first_name, employee.last_name].filter(Boolean).join(' ').trim() || "Noma'lum";
    const stats = efficiencyForWeek(tasksByEmployee.get(employee.id) ?? [], week);

    // A week with nothing due is 100% by convention (efficiencyForWeek) —
    // warning someone for having been given no work would be nonsense.
    const owedWarning = stats.totalDue > 0 && stats.efficiencyPct < WEEKLY_EFFICIENCY_WARN_THRESHOLD;
    let warned = false;
    if (owedWarning && employee.telegram_id !== null) {
      const chatId = Number(employee.telegram_id);
      if (Number.isFinite(chatId)) {
        try {
          await sendTelegramMessage(chatId, formatEmployeeWarning(name, stats, weekLabel));
          warned = true;
          warnedCount += 1;
        } catch (error) {
          // One blocked bot / deleted account must not abort the run: the
          // row is still written (with warned = false, which is the truth —
          // the person was never actually told).
          console.error('Weekly warning Telegram send failed:', error instanceof Error ? error.message : error);
        }
      }
    }

    try {
      await sql`
        insert into weekly_task_reports
          (user_id, week_start, week_end, total_due, done_on_time, done_late, not_done, efficiency_pct, warned)
        values
          (${employee.id}, ${week.startKey}, ${week.endKey}, ${stats.totalDue}, ${stats.doneOnTime},
           ${stats.doneLate}, ${stats.notDone}, ${stats.efficiencyPct}, ${warned})
        on conflict (user_id, week_start) do update set
          week_end       = excluded.week_end,
          total_due      = excluded.total_due,
          done_on_time   = excluded.done_on_time,
          done_late      = excluded.done_late,
          not_done       = excluded.not_done,
          efficiency_pct = excluded.efficiency_pct,
          -- Never downgrade a warning that already went out on an earlier
          -- run of the same week.
          warned         = weekly_task_reports.warned or excluded.warned
      `;
    } catch (error) {
      console.error('Weekly report upsert failed for', employee.id, error instanceof Error ? error.message : error);
    }

    const group = reportRoleGroup(employee.role);
    if (!group) continue;
    const bucket = byGroup.get(group) ?? [];
    bucket.push({
      name,
      efficiencyPct: stats.efficiencyPct,
      notDone: stats.notDone,
      line: formatEmployeeWeekLine(name, stats),
    });
    byGroup.set(group, bucket);
  }

  // lesson-plan-check resolves the CEO the same way: every profile with
  // role = 'ceo'. telegram_id may be null for a CEO who hasn't linked their
  // account yet; sendTelegramMessageToMany drops those silently and catches
  // each send individually.
  const ceoProfiles = await sql<{ telegram_id: string | number | null }[]>`
    select telegram_id from profiles where role = 'ceo'
  `;
  const ceoChatIds = ceoProfiles.map((c) => c.telegram_id);

  let groupsSent = 0;
  for (const group of REPORT_ROLE_GROUP_ORDER) {
    const members = byGroup.get(group);
    if (!members || members.length === 0) continue;
    // Worst first, so the CEO reads the problems before the good news; ties
    // broken by who left the most undone, then alphabetically for stability.
    members.sort(
      (a, b) => a.efficiencyPct - b.efficiencyPct || b.notDone - a.notDone || a.name.localeCompare(b.name),
    );
    const text = formatRoleGroupReport(
      REPORT_ROLE_GROUP_LABELS[group],
      weekLabel,
      members.map((m) => m.line),
    );
    try {
      await sendTelegramMessageToMany(ceoChatIds, text);
      groupsSent += 1;
    } catch (error) {
      // sendTelegramMessageToMany already swallows per-recipient failures;
      // this only guards against it throwing for some other reason, so one
      // group can't stop the remaining groups from being sent.
      console.error('Weekly CEO report send failed for group', group, error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({
    ok: true,
    week: week.startKey,
    employees: employees.length,
    warned: warnedCount,
    groupsSent,
  });
}
