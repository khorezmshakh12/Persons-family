'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';

export type StaffPerformanceActionState = { error?: string } | undefined;

const performanceSchema = z.object({
  staffId: z.string().uuid(),
  rating: z.string().optional().or(z.literal('')),
  bonus: z.string().optional().or(z.literal('')),
  penalty: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
});

export async function updateStaffPerformanceAction(
  _prevState: StaffPerformanceActionState,
  formData: FormData,
): Promise<StaffPerformanceActionState> {
  let actingProfile;
  try {
    ({ profile: actingProfile } = await requireAdmin());
  } catch {
    return { error: 'forbidden' };
  }

  const parsed = performanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const rating = parsed.data.rating ? Number(parsed.data.rating) : null;
  if (rating !== null && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
    return { error: 'invalidRating' };
  }

  const bonus = Number(parsed.data.bonus || 0);
  const penalty = Number(parsed.data.penalty || 0);
  if (Number.isNaN(bonus) || bonus < 0 || Number.isNaN(penalty) || penalty < 0) {
    return { error: 'invalidInput' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('staff_performance').upsert(
    {
      staff_id: parsed.data.staffId,
      rating,
      bonus,
      penalty,
      notes: parsed.data.notes || null,
      updated_by: actingProfile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'staff_id' },
  );
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/staff', 'page');
  return {};
}
