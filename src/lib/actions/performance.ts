'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
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
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = tierSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_performance').upsert(
    {
      staff_id: parsed.data.staffId,
      current_tier: parsed.data.currentTier,
      months_in_tier: parsed.data.monthsInTier,
      weekly_progress_score: parsed.data.weeklyProgressScore,
      notes: parsed.data.notes || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'staff_id' },
  );
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
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
    } = await requireCeo());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = addEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('performance_entries').insert({
    staff_id: parsed.data.staffId,
    entry_type: parsed.data.entryType,
    amount: parsed.data.amount,
    reason: parsed.data.reason || null,
    created_by: adminId,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
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
    await requireCeo();
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = deleteEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('performance_entries').delete().eq('id', parsed.data.entryId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/performance', 'page');
  return {};
}
