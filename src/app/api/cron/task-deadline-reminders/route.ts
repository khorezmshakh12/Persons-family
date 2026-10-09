import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { TASK_OPEN_STATUSES } from '@/lib/task-status';
import { isDueForCreation, nextDue, type Every } from '@/lib/task-recurrence';
import { tashkentDayKey, tashkentMidnight } from '@/lib/time';
import { bumpBoardSignal, bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { deliverScheduledChannelPosts } from '@/lib/chat-channels';
import { deliverScheduledNews } from '@/lib/news-delivery';

// Spec #4: nudge the assignee once, ~2 hours before a task's deadline.
// Cloud Scheduler should hit this every ~15 minutes (Bearer CRON_SECRET):
//
//   gcloud scheduler jobs create http task-deadline-reminders \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="*/15 * * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/task-deadline-reminders" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>" \
//     --account=azizullahusman2@gmail.com

const REMINDER_TEXT =
  "Deadline tugashiga 2 soat qoldi, berilgan vazifani vaqtida bajarishingizni so'rayman hurmat bilan Persons Agenti 🤖";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Still owed by the assignee, no reminder sent, and the deadline is inside
  // the next 2 hours (but not already past). One row per task — the assignee
  // only.
  //
  // `status in ('pending','in_progress')` rather than `<> 'done'`: nudging
  // someone to hurry up on work they already submitted (and that is now
  // waiting on the CEO, or on a proof upload they were only just cleared to
  // make) is noise.
  const due = await sql<{ id: string; telegram_id: number | null }[]>`
    select t.id, p.telegram_id
    from tasks t
    join profiles p on p.id = t.assigned_to
    where t.status in ${sql([...TASK_OPEN_STATUSES])}
      and t.deadline_reminder_sent_at is null
      and t.deadline > now()
      and t.deadline <= now() + interval '2 hours'
  `;

  let sent = 0;
  let skipped = 0;
  for (const task of due) {
    if (task.telegram_id) {
      try {
        await sendTelegramMessage(task.telegram_id, REMINDER_TEXT);
        sent += 1;
      } catch (error) {
        // Leave deadline_reminder_sent_at null so the next run retries.
        console.error('task-deadline-reminders: send failed', task.id, error instanceof Error ? error.message : error);
        continue;
      }
    } else {
      skipped += 1; // no Telegram linked — still stamp so we stop rescanning it
    }
    await sql`update tasks set deadline_reminder_sent_at = now() where id = ${task.id}`;
  }

  const recurring = await createRecurringTasks().catch((error) => {
    console.error('recurring tasks failed', error instanceof Error ? error.message : error);
    return -1;
  });
  // Chat: scheduled channel posts that came due since the last run.
  const scheduledPosts = await deliverScheduledChannelPosts().catch((error) => {
    console.error('deliverScheduledChannelPosts failed', error instanceof Error ? error.message : error);
    return 0;
  });
  // News: scheduled company posts whose publish time has passed.
  const scheduledNews = await deliverScheduledNews().catch((error) => {
    console.error('deliverScheduledNews failed', error instanceof Error ? error.message : error);
    return 0;
  });
  return NextResponse.json({ ok: true, candidates: due.length, sent, skipped, recurring, scheduledPosts, scheduledNews });
}

/**
 * Recurring tasks ride on this 15-minute cron: every active template whose
 * next deadline is inside its creation window (LEAD_DAYS before it) gets the
 * next instance. The `last_due` compare-and-set makes a double run harmless.
 */
async function createRecurringTasks(): Promise<number> {
  const today = tashkentDayKey();
  const rows = await sql<
    {
      id: string;
      title: string;
      description: string | null;
      assigned_to: string;
      assigned_by: string | null;
      every: Every;
      due_time: string;
      last_due: string;
      star_reward: number;
      star_penalty: number;
      requires_proof: boolean;
      telegram_id: number | null;
    }[]
  >`
    select r.id, r.title, r.description, r.assigned_to, r.assigned_by, r.every, r.due_time, r.last_due::text as last_due,
      r.star_reward, r.star_penalty, r.requires_proof, p.telegram_id
    from task_recurrences r join profiles p on p.id = r.assigned_to
    where r.active and p.is_active`;
  let created = 0;
  for (const r of rows) {
    const due = nextDue(r.last_due, r.every);
    if (!isDueForCreation(today, due, r.every)) continue;
    const [h, m] = r.due_time.split(':').map(Number);
    const deadline = new Date(tashkentMidnight(due).getTime() + (h * 60 + m) * 60_000).toISOString();
    const made = await sql.begin(async (tx) => {
      const claimed = await tx`update task_recurrences set last_due = ${due} where id = ${r.id} and last_due = ${r.last_due}`;
      if (claimed.count === 0) return false;
      await tx`
        insert into tasks (title, description, assigned_to, assigned_by, deadline, star_reward, star_penalty, requires_proof)
        values (${r.title}, ${r.description}, ${r.assigned_to}, ${r.assigned_by}, ${deadline}, ${r.star_reward}, ${r.star_penalty}, ${r.requires_proof})`;
      return true;
    });
    if (!made) continue;
    created += 1;
    await bumpNavBadgeSignal(r.assigned_to).catch(() => {});
    if (r.telegram_id) {
      await sendTelegramMessage(r.telegram_id, `🔁 Takrorlanuvchi vazifa: <b>${escapeTelegramText(r.title)}</b>\nMuddat: ${due} ${r.due_time}`).catch(() => {});
    }
  }
  if (created) await bumpBoardSignal('tasks').catch(() => {});
  return created;
}
