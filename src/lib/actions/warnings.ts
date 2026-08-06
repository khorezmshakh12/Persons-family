'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { ForbiddenError, requireAdmin } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';
import { escapeTelegramText, sendTelegramMessage } from '@/lib/telegram';

export type WarningActionState = { error?: string } | undefined;

/** CEO, IT Developer, and Administrative Manager all issue warnings —
 * mirrors staff_warnings_insert's public.is_ceo_or_admin_manager() RLS
 * check (is_admin() there now covers ceo + it_developer). */
async function requireCeoOrAdminManager() {
  const { user, profile } = await getAuthState();
  if (
    !user ||
    !profile ||
    (profile.role !== 'ceo' && profile.role !== 'it_developer' && profile.role !== 'admin_manager')
  ) {
    throw new ForbiddenError('CEO, IT Developer, or Administrative Manager access required');
  }
  return { user, profile };
}

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = warningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_warnings').insert({
    staff_id: parsed.data.staffId,
    reason: parsed.data.reason,
    issued_by: issuerId,
  });
  if (error) return { error: 'createFailed' };

  logSystemAction(supabase, 'warning.issue', `Issued a warning to staff ${parsed.data.staffId}`);

  const { data: recipient } = await supabase
    .from('profiles')
    .select('telegram_id')
    .eq('id', parsed.data.staffId)
    .maybeSingle();
  void notifyWarningIssued({ reason: parsed.data.reason, recipientTelegramId: recipient?.telegram_id ?? null });

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = deleteWarningSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_warnings').delete().eq('id', parsed.data.warningId);
  if (error) return { error: 'deleteFailed' };

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
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = punishmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();

  // The RLS insert policy only checks that warning_id is non-null for an
  // admin_manager caller, not that it actually belongs to this staff member
  // — confirm that relationship here so a punishment can't be filed against
  // the wrong person's warning.
  const { data: warning } = await supabase
    .from('staff_warnings')
    .select('staff_id')
    .eq('id', parsed.data.warningId)
    .maybeSingle();
  if (!warning || warning.staff_id !== parsed.data.staffId) return { error: 'invalidWarning' };

  const { error } = await supabase.from('performance_entries').insert({
    staff_id: parsed.data.staffId,
    entry_type: 'penalty',
    amount: parsed.data.amount,
    reason: parsed.data.reason || null,
    created_by: actorId,
    warning_id: parsed.data.warningId,
  });
  if (error) return { error: 'createFailed' };

  logSystemAction(
    supabase,
    'performance.punishment',
    `Assigned a punishment to staff ${parsed.data.staffId} for warning ${parsed.data.warningId}`,
  );

  revalidatePath('/[locale]/self-development', 'page');
  return {};
}
