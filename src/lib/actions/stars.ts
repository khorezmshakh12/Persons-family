'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getFormatter } from 'next-intl/server';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { insertStarTransaction, type StarSourceType } from '@/lib/stars-write';

export type StarsActionState = { error?: string } | undefined;

const awardSchema = z.object({
  userId: z.string().uuid(),
  // A signed integer: > 0 awards, < 0 deducts (and raises a warning). 0 is
  // rejected — an empty ledger row would be noise, not a record.
  delta: z.coerce.number().int().refine((n) => n !== 0, 'delta must be non-zero'),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

/** Fire-and-forget — mirrors notifyWarningIssued in warnings.ts. A Telegram
 * hiccup must never fail the CEO's deduction, which has already committed. */
async function notifyStarsDeducted({
  amount,
  reason,
  recipientTelegramId,
}: {
  amount: number;
  reason: string | null;
  recipientTelegramId: number | null;
}) {
  if (!recipientTelegramId) return;
  try {
    const text =
      `<b>Sizdan ${amount} yulduz yechildi</b>` +
      (reason ? `\nSabab: ${escapeTelegramText(reason)}` : '') +
      `\nShu bilan birga sizga ogohlantirish berildi.`;
    await sendTelegramMessage(recipientTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

/**
 * The single CEO-facing star adjustment (spec #4): one signed `delta`.
 * Positive = a manual award, negative = a penalty which ALSO files a
 * staff_warnings row and pings the employee on Telegram — deducting stars is
 * never a silent bookkeeping change, the employee has to learn about it.
 */
export async function awardStarsAction(
  _prevState: StarsActionState,
  formData: FormData,
): Promise<StarsActionState> {
  let actorId: string;
  try {
    ({
      user: { id: actorId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = awardSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const { userId, delta } = parsed.data;
  const reason = parsed.data.reason?.trim() ? parsed.data.reason.trim() : null;
  const sourceType: StarSourceType = delta > 0 ? 'manual' : 'penalty';

  // Guard against awarding to someone who isn't a staff member at all — the
  // FK would raise anyway, but that surfaces as an opaque 'createFailed'.
  const [target] = await sql<{ id: string; telegram_id: number | null }[]>`
    select id, telegram_id from profiles where id = ${userId}
  `;
  if (!target) return { error: 'invalidInput' };

  try {
    await insertStarTransaction(sql, {
      userId,
      delta,
      reason,
      sourceType,
      createdBy: actorId,
    });
  } catch {
    return { error: 'createFailed' };
  }

  if (delta < 0) {
    const amount = Math.abs(delta);
    const warningReason = reason
      ? `Yulduz yechildi (${amount}): ${reason}`
      : `Yulduz yechildi (${amount})`;
    // The ledger row is already committed, so a failure here must not turn
    // into an error result the CEO could retry — that would double-deduct.
    try {
      await sql`
        insert into staff_warnings (staff_id, reason, issued_by)
        values (${userId}, ${warningReason}, ${actorId})
      `;
    } catch (error) {
      console.error('stars: warning insert failed', error instanceof Error ? error.message : error);
    }
    await bumpNavBadgeSignal(userId);
    // See staff-chats.ts's `after()` comment — a bare un-awaited send can be
    // torn down with the request before it finishes.
    after(() => notifyStarsDeducted({ amount, reason, recipientTelegramId: target.telegram_id }));
  }

  logSystemAction(
    delta > 0 ? 'stars.award' : 'stars.deduct',
    `${delta > 0 ? 'Awarded' : 'Deducted'} ${Math.abs(delta)} stars ${delta > 0 ? 'to' : 'from'} staff ${userId}`,
  );

  revalidatePath('/[locale]/profile/[id]', 'page');
  revalidatePath('/[locale]/profile', 'page');
  revalidatePath('/[locale]/market', 'page');
  return {};
}

export type StarLedgerEntry = {
  id: string;
  delta: number;
  reason: string | null;
  source_type: StarSourceType;
  source_id: string | null;
  created_at: string;
  created_by_first_name: string | null;
  created_by_last_name: string | null;
};

/**
 * Recent ledger rows for one user. Everyone can read their own; only the CEO
 * can read somebody else's — this is the only gate, the table has no RLS.
 */
export async function getStarLedgerAction(userId?: string): Promise<StarLedgerEntry[]> {
  const { user, profile } = await getAuthState();
  if (!user) return [];

  const targetId = userId ?? user.id;
  if (targetId !== user.id && profile?.role !== 'ceo') return [];
  if (!z.string().uuid().safeParse(targetId).success) return [];

  return sql<StarLedgerEntry[]>`
    select t.id, t.delta, t.reason, t.source_type, t.source_id, t.created_at,
           actor.first_name as created_by_first_name,
           actor.last_name  as created_by_last_name
    from star_transactions t
    left join profiles actor on actor.id = t.created_by
    where t.user_id = ${targetId}
    order by t.created_at desc
    limit 50
  `;
}

export type ArchivedStarRow = {
  id: string;
  /** Signed: > 0 earned, < 0 spent/deducted. */
  delta: number;
  reason: string | null;
  source_type: StarSourceType;
  created_at: string;
};

export type MonthlyStarsArchiveEntry = {
  /** 'YYYY-MM', Asia/Tashkent. */
  monthKey: string;
  /** Month name localized to the caller's locale, e.g. "August 2026". */
  label: string;
  /** sum(delta) — may be negative. Always `earned - spent`. */
  net: number;
  /** Total of the positive deltas. */
  earned: number;
  /** Total of the negative deltas, as a positive magnitude. */
  spent: number;
  /** Newest first. */
  transactions: ArchivedStarRow[];
};

/**
 * Past months' star ledger for one user, one entry per Tashkent month that
 * has at least one transaction, newest first — the collapsed-archive shape
 * getMonthlyTaskArchiveAction returns for the task board, applied to the
 * ledger StarBalanceCard renders live.
 *
 * Same visibility rule as getStarLedgerAction above (own ledger, or the CEO
 * reading anyone's) — that is the only gate, the table has no RLS. Unlike
 * that one this never throws: an unauthorized caller and a broken query both
 * come back as [], so a failure degrades this section rather than the page.
 *
 * Deliberately unbounded where getStarLedgerAction stops at 50 rows: this IS
 * the full history, and its per-month totals have to add up to the balance,
 * which a truncated list could not do.
 */
export async function getMonthlyStarsArchiveAction(
  userId?: string,
): Promise<MonthlyStarsArchiveEntry[]> {
  try {
    const { user, profile } = await getAuthState();
    if (!user) return [];

    const targetId = userId ?? user.id;
    if (targetId !== user.id && profile?.role !== 'ceo') return [];
    if (!z.string().uuid().safeParse(targetId).success) return [];

    const rows = await sql<(ArchivedStarRow & { month_key: string })[]>`
      select t.id, t.delta, t.reason, t.source_type, t.created_at,
             to_char(t.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key
      from star_transactions t
      where t.user_id = ${targetId}
        -- Strictly before the current Tashkent month; the boundary must be
        -- computed in that zone (see actions/tasks.ts), not in the server's UTC.
        and t.created_at < date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent'
      order by t.created_at desc
    `;
    if (rows.length === 0) return [];

    const format = await getFormatter();
    const byMonth = new Map<string, ArchivedStarRow[]>();
    for (const { month_key: monthKey, ...tx } of rows) {
      const bucket = byMonth.get(monthKey);
      if (bucket) bucket.push(tx);
      else byMonth.set(monthKey, [tx]);
    }

    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, transactions]) => {
        const earned = transactions.reduce((sum, tx) => (tx.delta > 0 ? sum + tx.delta : sum), 0);
        const spent = transactions.reduce((sum, tx) => (tx.delta < 0 ? sum - tx.delta : sum), 0);
        return {
          monthKey,
          // Parsed and formatted as UTC on purpose: the key is already a
          // Tashkent month, so re-applying a zone could name its neighbour.
          label: format.dateTime(new Date(`${monthKey}-01T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          net: earned - spent,
          earned,
          spent,
          transactions,
        };
      });
  } catch (error) {
    console.error(
      'getMonthlyStarsArchiveAction failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
