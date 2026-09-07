import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { insertStarTransaction } from '@/lib/stars-write';
import { sendTelegramMessage } from '@/lib/telegram';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

// Auto-apply a task's star_penalty once its deadline has passed while it is
// still not done. updateTaskStatusAction settles the fine only when the
// assignee *eventually* marks the task done late (its "Stars settle exactly
// once" block); a task simply left untouched past its deadline was never
// charged. This cron closes that gap.
//
// It reuses the very same `star_penalty > 0 and star_penalty_applied_at is
// null` guard in the WHERE of the stamping UPDATE that the completion path
// uses, so whichever runs first wins and the other no-ops — the two can
// never double-charge one task.
//
// Cloud Scheduler should hit this every ~15 minutes (Bearer CRON_SECRET):
//
//   gcloud scheduler jobs create http task-overdue-penalties \
//     --project=persons-staff-b01a83bd --location=europe-west3 \
//     --schedule="*/15 * * * *" --time-zone="Asia/Tashkent" \
//     --uri="https://persons-staff-app-121315485439.europe-west3.run.app/staff/api/cron/task-overdue-penalties" \
//     --http-method=GET --headers="Authorization=Bearer <CRON_SECRET>" \
//     --account=azizullahusman2@gmail.com

/** Best-effort nudge to the assignee — hardcoded Uzbek, same as the sibling
 * route's REMINDER_TEXT. The "warning" here is only this line of copy; no
 * staff_warnings row is created (product decision). */
function penaltyText(stars: number): string {
  return (
    `Sizdan ${stars} yulduz yechildi\n` +
    'Sabab: Deadline bilan ishlanmagani uchun\n' +
    'Shu bilan birga sizga ogohlantirish berildi.'
  );
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Overdue, still open, carrying an unpaid fine. One row per task — the
  // assignee only.
  const rows = await sql<
    { id: string; star_penalty: number; assigned_to: string; telegram_id: number | null }[]
  >`
    select t.id, t.star_penalty, t.assigned_to, p.telegram_id
    from tasks t
    join profiles p on p.id = t.assigned_to
    where t.status <> 'done'
      and t.deadline < now()
      and t.star_penalty > 0
      and t.star_penalty_applied_at is null
  `;

  let charged = 0;
  let skipped = 0;
  let telegramSent = 0;

  for (const task of rows) {
    // Stamp + ledger in one transaction: the guarded UPDATE is what makes
    // "settle once" atomic against a concurrent late completion, and the
    // negative star_transactions row must commit or roll back with it.
    let magnitude: number | null = null;
    try {
      magnitude = await sql.begin(async (tx) => {
        const [applied] = await tx<{ star_penalty: number }[]>`
          update tasks set star_penalty_applied_at = now()
          where id = ${task.id} and star_penalty > 0 and star_penalty_applied_at is null
          returning star_penalty
        `;
        if (!applied) return null; // raced with a late completion — skip
        await insertStarTransaction(tx, {
          userId: task.assigned_to,
          // The column holds a positive magnitude; the ledger carries the
          // sign (negative delta — same shape as a CEO deduction). Mirrors
          // updateTaskStatusAction's late-completion branch, with a
          // distinct reason so the two are told apart in the ledger.
          delta: -applied.star_penalty,
          reason: 'Deadline bilan ishlanmagani uchun',
          sourceType: 'task',
          sourceId: task.id,
          // A cron/system flow — no human actor (see stars-write.ts).
          createdBy: null,
        });
        return applied.star_penalty;
      });
    } catch (error) {
      // Leave star_penalty_applied_at null so the next run retries.
      console.error(
        'task-overdue-penalties: charge failed',
        task.id,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    if (magnitude == null) {
      skipped += 1;
      continue;
    }
    charged += 1;

    try {
      await bumpNavBadgeSignal(task.assigned_to);
    } catch (error) {
      console.error(
        'task-overdue-penalties: badge bump failed',
        task.id,
        error instanceof Error ? error.message : error,
      );
    }

    if (task.telegram_id) {
      try {
        await sendTelegramMessage(task.telegram_id, penaltyText(magnitude));
        telegramSent += 1;
      } catch (error) {
        // The fine is already committed — the message is best-effort.
        console.error(
          'task-overdue-penalties: telegram send failed',
          task.id,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, candidates: rows.length, charged, skipped, telegramSent });
}
