'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';

export type PerformanceActionState = { error?: string } | undefined;

const tierSchema = z.object({
  staffId: z.string().uuid(),
  currentTier: z.enum(['A', 'B', 'C']),
  monthsInTier: z.coerce.number().int().min(0).max(6),
  weeklyProgressScore: z.coerce.number().int().min(0).max(100),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
});

/** CEO/Admin sets a staff member's tier + weekly progress score — same
 * upsert this used to be inside the /staff edit dialog, now living on its
 * own /performance page. Bonus/penalty are handled separately below as an
 * append-only ledger instead of a single editable total. */
export async function updateStaffTierAction(
  _prevState: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = tierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into staff_performance (staff_id, current_tier, months_in_tier, weekly_progress_score, notes, updated_at)
      values (${parsed.data.staffId}, ${parsed.data.currentTier}, ${parsed.data.monthsInTier}, ${parsed.data.weeklyProgressScore}, ${parsed.data.notes || null}, now())
      on conflict (staff_id) do update set
        current_tier = excluded.current_tier,
        months_in_tier = excluded.months_in_tier,
        weekly_progress_score = excluded.weekly_progress_score,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'performance.tier_update',
    `Set tier ${parsed.data.currentTier} / ${parsed.data.weeklyProgressScore}% for staff ${parsed.data.staffId}`,
  );

  revalidatePath('/[locale]/performance', 'page');
  return {};
}

const addEntrySchema = z.object({
  staffId: z.string().uuid(),
  entryType: z.enum(['bonus', 'penalty']),
  amount: z.coerce.number().positive(),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function addPerformanceEntryAction(
  _prevState: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  let adminId: string;
  try {
    ({
      user: { id: adminId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`
      insert into performance_entries (staff_id, entry_type, amount, reason, created_by)
      values (${parsed.data.staffId}, ${parsed.data.entryType}, ${parsed.data.amount}, ${parsed.data.reason || null}, ${adminId})
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    `performance.${parsed.data.entryType}`,
    `Added a ${parsed.data.entryType} of ${parsed.data.amount} for staff ${parsed.data.staffId}`,
  );

  revalidatePath('/[locale]/performance', 'page');
  return {};
}

const deleteEntrySchema = z.object({ entryId: z.string().uuid() });

export async function deletePerformanceEntryAction(
  _prevState: PerformanceActionState,
  formData: FormData,
): Promise<PerformanceActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    await sql`delete from performance_entries where id = ${parsed.data.entryId}`;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidatePath('/[locale]/performance', 'page');
  return {};
}
