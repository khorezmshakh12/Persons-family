'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type MissionActionState = { error?: string } | undefined;

function revalidateMissions(staffId: string) {
  revalidatePath('/[locale]/missions', 'page');
  revalidatePath(`/[locale]/missions/${staffId}`, 'page');
  revalidatePath(`/[locale]/finance/${staffId}`, 'page');
}

// Tashkent-local, not raw UTC — matches the cron job's reasoning
// (lesson-plan-check/route.ts): using the UTC calendar date would reject a
// deadline of "today" (Tashkent-local) as already-past during the first
// few hours of the Tashkent day, since UTC hasn't rolled over yet.
const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
const maxDeadlineStr = () => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 365);
  return d.toISOString().slice(0, 10);
};

const assignSchema = z.object({
  staffId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  deadlineDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => d >= todayStr() && d <= maxDeadlineStr(), 'deadlineRange'),
  bonusAmount: z.coerce.number().min(0).optional(),
});

/** CEO-only — mirrors requireCeo() now used across KPI/Income Roadmap, not
 * the broader requireAdmin() this used before: missions are assignable
 * (per the CEO) even to IT Developer, so IT Developer can't also be the one
 * managing them. */
export async function assignMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  let adminId: string;
  try {
    ({
      user: { id: adminId },
    } = await requireCeo());
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
    deadline_date: parsed.data.deadlineDate,
    bonus_amount: parsed.data.bonusAmount ?? null,
    created_by: adminId,
  });
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
    'missions.assign',
    `Assigned mission "${parsed.data.title}" to staff ${parsed.data.staffId}, due ${parsed.data.deadlineDate}`,
  );

  revalidateMissions(parsed.data.staffId);
  return {};
}

const staffTransitionSchema = z.object({ missionId: z.string().uuid(), staffId: z.string().uuid() });

/** Only the assignee — protect_mission_fields() enforces the pending ->
 * in_progress transition itself; this just needs to be the right person
 * making the request at all. */
export async function startMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = staffTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (user.id !== parsed.data.staffId) return { error: 'forbidden' };

  const supabase = await createClient();
  const { error } = await supabase.from('missions').update({ status: 'in_progress' }).eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidateMissions(parsed.data.staffId);
  return {};
}

const submitSchema = z.object({
  missionId: z.string().uuid(),
  staffId: z.string().uuid(),
  submissionNote: z.string().trim().min(1).max(2000),
});

export async function submitMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (user.id !== parsed.data.staffId) return { error: 'forbidden' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('missions')
    .update({ status: 'submitted', submission_note: parsed.data.submissionNote })
    .eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidateMissions(parsed.data.staffId);
  return {};
}

const approveSchema = z.object({ missionId: z.string().uuid(), staffId: z.string().uuid() });

export async function approveMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = approveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('missions').update({ status: 'approved' }).eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  logSystemAction(supabase, 'missions.approve', `Approved mission ${parsed.data.missionId}`);

  revalidateMissions(parsed.data.staffId);
  return {};
}

const rejectSchema = z.object({
  missionId: z.string().uuid(),
  staffId: z.string().uuid(),
  rejectionNote: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Rejecting reopens the mission (the trigger resets status to
 * in_progress) rather than leaving it in a dead-end state — the assignee
 * fixes it up and resubmits. */
export async function rejectMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('missions')
    .update({ status: 'rejected', rejection_note: parsed.data.rejectionNote || null })
    .eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidateMissions(parsed.data.staffId);
  return {};
}

const deleteSchema = z.object({ missionId: z.string().uuid(), staffId: z.string().uuid() });

export async function deleteMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('missions').delete().eq('id', parsed.data.missionId);
  if (error) return { error: 'updateFailed' };

  revalidateMissions(parsed.data.staffId);
  return {};
}
