'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getFormatter } from 'next-intl/server';
import { requireAdmin, requireCeoOrAdminManager, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';

export type WarningActionState = { error?: string } | undefined;

const warningSchema = z.object({
  staffId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

/** Fire-and-forget notification to the staff member who was warned —
 * mirrors notifyTaskAssigned/notifyIssueCreated. A Telegram hiccup must
 * never affect the response to the admin who just issued the warning. */
async function notifyWarningIssued({
  reason,
  recipientTelegramId,
}: {
  reason: string;
  recipientTelegramId: number | null;
}) {
  if (!recipientTelegramId) return;
  try {
    const text = `<b>Sizga ogohlantirish berildi</b>\nSabab: ${escapeTelegramText(reason)}`;
    await sendTelegramMessage(recipientTelegramId, text);
  } catch (error) {
    console.error('Telegram Notification Failed:', error instanceof Error ? error.message : error);
  }
}

export async function issueWarningAction(
  _prevState: WarningActionState,
  formData: FormData,
): Promise<WarningActionState> {
  let issuerId: string;
  try {
    ({
      user: { id: issuerId },
    } = await requireCeoOrAdminManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = warningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into staff_warnings (staff_id, reason, issued_by)
      values (${parsed.data.staffId}, ${parsed.data.reason}, ${issuerId})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  await bumpNavBadgeSignal(parsed.data.staffId);
  logSystemAction('warning.issue', `Issued a warning to staff ${parsed.data.staffId}`);

  const [recipient] = await sql<{ telegram_id: number | null }[]>`
    select telegram_id from profiles where id = ${parsed.data.staffId}
  `;
  // See staff-chats.ts's `after()` comment — Vercel can tear down a bare
  // un-awaited fire-and-forget call before its Telegram send finishes.
  after(() =>
    notifyWarningIssued({ reason: parsed.data.reason, recipientTelegramId: recipient?.telegram_id ?? null }),
  );

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const deleteWarningSchema = z.object({ warningId: z.string().uuid() });

export async function deleteWarningAction(
  _prevState: WarningActionState,
  formData: FormData,
): Promise<WarningActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteWarningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`delete from staff_warnings where id = ${parsed.data.warningId}`;
  } catch (error) {
    console.error('deleteWarningAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  revalidatePath('/[locale]/staff', 'page');
  return {};
}

const punishmentSchema = z.object({
  staffId: z.string().uuid(),
  warningId: z.string().uuid(),
  amount: z.coerce.number().min(0),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

/** The "Warning -> Punishment" trigger: assigning a punishment is inserting
 * a performance_entries row (entry_type = 'penalty') linked back to the
 * warning that justified it — see 20260803091000_warnings_and_punishments.sql
 * for why this reuses the existing bonus/penalty ledger instead of a
 * separate table. amount may be 0 (a reprimand with no fine attached). */
export async function assignPunishmentAction(
  _prevState: WarningActionState,
  formData: FormData,
): Promise<WarningActionState> {
  let actorId: string;
  try {
    ({
      user: { id: actorId },
    } = await requireCeoOrAdminManager());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = punishmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  // Confirm the warning actually belongs to this staff member — a
  // punishment must never be filed against the wrong person's warning.
  const [warning] = await sql<{ staff_id: string }[]>`
    select staff_id from staff_warnings where id = ${parsed.data.warningId}
  `;
  if (!warning || warning.staff_id !== parsed.data.staffId) return { error: 'invalidWarning' };

  try {
    await sql`
      insert into performance_entries (staff_id, entry_type, amount, reason, created_by, warning_id)
      values (${parsed.data.staffId}, 'penalty', ${parsed.data.amount}, ${parsed.data.reason || null}, ${actorId}, ${parsed.data.warningId})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction(
    'performance.punishment',
    `Assigned a punishment to staff ${parsed.data.staffId} for warning ${parsed.data.warningId}`,
  );

  revalidatePath('/[locale]/self-development', 'page');
  return {};
}

export type ArchivedWarningRow = {
  id: string;
  reason: string;
  created_at: string;
  issuer_first_name: string | null;
  issuer_last_name: string | null;
};

export type MonthlyWarningsArchiveEntry = {
  /** 'YYYY-MM', Asia/Tashkent. */
  monthKey: string;
  /** Month name localized to the caller's locale, e.g. "August 2026". */
  label: string;
  /** How many warnings were issued in this month. */
  count: number;
  /** Newest first, same order WarningsCard uses. */
  warnings: ArchivedWarningRow[];
};

/**
 * Past months' warnings for one staff member, one entry per Tashkent month
 * that has at least one row, newest first — the same collapsed-archive shape
 * getMonthlyTaskArchiveAction returns for the task board. The live
 * WarningsCard keeps showing everything; this is the month-by-month reading
 * of the same table, rendered under it.
 *
 * Visibility deliberately reuses the profile page's own rule (`isSelf ||
 * CEO || Administrative Manager`, which is what gates WarningsCard being
 * rendered at all) rather than inventing a second one: self is allowed
 * directly, everyone else has to clear the existing requireCeoOrAdminManager
 * helper. Never throws — an unauthorized caller and a broken query both come
 * back as [], so a failure degrades this one section instead of the page.
 */
export async function getMonthlyWarningsArchiveAction(
  staffId: string,
): Promise<MonthlyWarningsArchiveEntry[]> {
  try {
    const { user } = await getAuthState();
    if (!user) return [];
    if (!z.string().uuid().safeParse(staffId).success) return [];

    if (staffId !== user.id) {
      try {
        await requireCeoOrAdminManager();
      } catch {
        return [];
      }
    }

    const rows = await sql<(ArchivedWarningRow & { month_key: string })[]>`
      select
        w.id,
        w.reason,
        w.created_at,
        issuer.first_name as issuer_first_name,
        issuer.last_name  as issuer_last_name,
        to_char(w.created_at at time zone 'Asia/Tashkent', 'YYYY-MM') as month_key
      from staff_warnings w
      left join profiles issuer on issuer.id = w.issued_by
      where w.staff_id = ${staffId}
        -- Strictly before the current Tashkent month. The boundary has to be
        -- computed in that zone (see actions/tasks.ts) — a bare
        -- date_trunc('month', now()) rolls over five hours late.
        and w.created_at < date_trunc('month', now() at time zone 'Asia/Tashkent') at time zone 'Asia/Tashkent'
      order by w.created_at desc
    `;
    if (rows.length === 0) return [];

    const format = await getFormatter();
    const byMonth = new Map<string, ArchivedWarningRow[]>();
    for (const { month_key: monthKey, ...warning } of rows) {
      const bucket = byMonth.get(monthKey);
      if (bucket) bucket.push(warning);
      else byMonth.set(monthKey, [warning]);
    }

    // Rows already arrive newest-first, so insertion order is the order we
    // want; sorted anyway so the contract doesn't depend on the query's.
    return [...byMonth.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([monthKey, warnings]) => ({
        monthKey,
        // Parsed and formatted as UTC on purpose: the key is already a
        // Tashkent month, so re-applying a zone could name its neighbour.
        label: format.dateTime(new Date(`${monthKey}-01T00:00:00Z`), {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        count: warnings.length,
        warnings,
      }));
  } catch (error) {
    console.error(
      'getMonthlyWarningsArchiveAction failed',
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}
