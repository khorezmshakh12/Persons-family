import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { sendTelegramMessage } from '@/lib/telegram';

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

  // Not yet done, no reminder sent, and the deadline is inside the next 2
  // hours (but not already past). One row per task — the assignee only.
  const due = await sql<{ id: string; telegram_id: number | null }[]>`
    select t.id, p.telegram_id
    from tasks t
    join profiles p on p.id = t.assigned_to
    where t.status <> 'done'
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

  return NextResponse.json({ ok: true, candidates: due.length, sent, skipped });
}
