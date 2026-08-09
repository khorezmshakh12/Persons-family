'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type MissionActionState = { error?: string } | undefined;

const assignSchema = z.object({
  staffId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
});

export async function assignMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  let adminId: string;
  try {
    ({
      user: { id: adminId },
    } = await requireAdmin());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('missions').insert({
    staff_id: parsed.data.staffId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    created_by: adminId,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
    'missions.assign',
    `Assigned mission "${parsed.data.title}" to staff ${parsed.data.staffId}`,
  );

  revalidatePath('/[locale]/missions', 'page');
  return {};
}

const toggleSchema = z.object({
  missionId: z.string().uuid(),
  isCompleted: z.enum(['true', 'false']),
});

/** Only the assignee may toggle their own mission's completion — mirrors
 * protect_mission_fields' `auth.uid() = staff_id` check at the DB layer
 * (tasks.ts's updateTaskStatusAction is the identical precedent). */
export async function toggleMissionCompleteAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('missions')
    .select('staff_id')
    .eq('id', parsed.data.missionId)
    .maybeSingle();
  if (!existing || existing.staff_id !== user.id) return { error: 'forbidden' };

  const isCompleted = parsed.data.isCompleted === 'true';
  const { error } = await supabase
    .from('missions')
    .update({ is_completed: isCompleted, completed_at: isCompleted ? new Date().toISOString() : null })
    .eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/missions', 'page');
  return {};
}

const deleteSchema = z.object({ missionId: z.string().uuid() });

export async function deleteMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('missions').delete().eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidatePath('/[locale]/missions', 'page');
  return {};
}
