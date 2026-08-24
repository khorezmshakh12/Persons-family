'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
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

  try {
    await sql`
      insert into missions (staff_id, title, description, deadline_date, bonus_amount, created_by)
      values (${parsed.data.staffId}, ${parsed.data.title}, ${parsed.data.description || null}, ${parsed.data.deadlineDate}, ${parsed.data.bonusAmount ?? null}, ${adminId})
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'missions.assign',
    `Assigned mission "${parsed.data.title}" to staff ${parsed.data.staffId}, due ${parsed.data.deadlineDate}`,
  );

  revalidateMissions(parsed.data.staffId);
  return {};
}

const staffTransitionSchema = z.object({ missionId: z.string().uuid(), staffId: z.string().uuid() });

/** Only the assignee. The old protect_mission_fields() trigger enforced the
 * pending -> in_progress transition (and stamped started_at) at the DB
 * layer — Cloud SQL has no trigger layer here, so the same guard (only
 * transition out of 'pending') and the started_at stamp are now done
 * explicitly in this query instead. */
export async function startMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = staffTransitionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (user.id !== parsed.data.staffId) return { error: 'forbidden' };

  await sql`
    update missions set status = 'in_progress', started_at = now()
    where id = ${parsed.data.missionId} and staff_id = ${parsed.data.staffId} and status = 'pending'
  `;

  revalidateMissions(parsed.data.staffId);
  return {};
}

const submitSchema = z.object({
  missionId: z.string().uuid(),
  staffId: z.string().uuid(),
  submissionNote: z.string().trim().min(1).max(2000),
});

/** Mirrors protect_mission_fields()'s in_progress -> submitted guard and
 * submitted_at stamp (see startMissionAction's note). */
export async function submitMissionAction(
  _prevState: MissionActionState,
  formData: FormData,
): Promise<MissionActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (user.id !== parsed.data.staffId) return { error: 'forbidden' };

  await sql`
    update missions set status = 'submitted', submission_note = ${parsed.data.submissionNote}, submitted_at = now()
    where id = ${parsed.data.missionId} and staff_id = ${parsed.data.staffId} and status = 'in_progress'
  `;

  revalidateMissions(parsed.data.staffId);
  return {};
}

const approveSchema = z.object({ missionId: z.string().uuid(), staffId: z.string().uuid() });

/** Mirrors protect_mission_fields()'s submitted -> approved guard and
 * approved_at stamp. */
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

  await sql`
    update missions set status = 'approved', approved_at = now()
    where id = ${parsed.data.missionId} and status = 'submitted'
  `;

  logSystemAction('missions.approve', `Approved mission ${parsed.data.missionId}`);

  revalidateMissions(parsed.data.staffId);
  return {};
}

const rejectSchema = z.object({
  missionId: z.string().uuid(),
  staffId: z.string().uuid(),
  rejectionNote: z.string().trim().max(1000).optional().or(z.literal('')),
});

/** Rejecting reopens the mission rather than leaving it in a dead-end state
 * — the assignee fixes it up and resubmits. The old trigger did this by
 * writing status='rejected' and then immediately overriding it back to
 * 'in_progress' (clearing submitted_at) inside the same BEFORE UPDATE fire;
 * with no trigger layer, this just writes the final 'in_progress' state
 * directly — 'rejected' was never a value anyone could observe even before
 * (the override was synchronous), so this is behaviorally identical. */
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

  await sql`
    update missions set status = 'in_progress', rejection_note = ${parsed.data.rejectionNote || null}, submitted_at = null
    where id = ${parsed.data.missionId} and status = 'submitted'
  `;

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

  await sql`delete from missions where id = ${parsed.data.missionId}`;

  revalidateMissions(parsed.data.staffId);
  return {};
}
