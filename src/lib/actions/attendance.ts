'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireSection } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { ATTENDANCE_STATUSES, DAY_RE, TIME_RE, WORK_START } from '@/lib/attendance';

type Result = { error?: string };

const time = z.union([z.literal(''), z.string().regex(TIME_RE)]);
const day = z.string().regex(DAY_RE);
const recordSchema = z.object({
  profileId: z.string().uuid(),
  day,
  checkIn: time,
  checkOut: time,
  status: z.enum(ATTENDANCE_STATUSES),
  note: z.string().max(500),
});

async function requireMarker(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireSection('attendance');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

/** Writes one employee's attendance for one day (insert or replace). */
export async function saveAttendanceAction(input: z.input<typeof recordSchema>): Promise<Result> {
  const g = await requireMarker();
  if ('error' in g) return g;
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidInput' };
  const r = parsed.data;
  try {
    await sql`
      insert into staff_attendance (profile_id, day, check_in, check_out, status, note, updated_by, updated_at)
      values (${r.profileId}, ${r.day}, ${r.checkIn || null}, ${r.checkOut || null}, ${r.status}, ${r.note.trim()}, ${g.id}, now())
      on conflict (profile_id, day) do update set
        check_in = excluded.check_in, check_out = excluded.check_out, status = excluded.status,
        note = excluded.note, updated_by = excluded.updated_by, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/attendance', 'page');
  return {};
}

/** Removes one employee's record for the day — back to "nothing marked". */
export async function clearAttendanceAction(profileId: string, dayKey: string): Promise<Result> {
  const g = await requireMarker();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(profileId).success || !day.safeParse(dayKey).success) return { error: 'invalidInput' };
  try {
    await sql`delete from staff_attendance where profile_id = ${profileId} and day = ${dayKey}`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/attendance', 'page');
  return {};
}

/** «Barchani "Ofisda" qilish»: every active employee who is absent (or not
 * marked yet) that day becomes "office" from 09:00. */
export async function markAllPresentAction(dayKey: string): Promise<Result> {
  const g = await requireMarker();
  if ('error' in g) return g;
  if (!day.safeParse(dayKey).success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into staff_attendance (profile_id, day, check_in, status, updated_by, updated_at)
      select p.id, ${dayKey}, ${WORK_START}, 'office', ${g.id}, now()
      from profiles p where p.is_active
      on conflict (profile_id, day) do update set
        check_in = excluded.check_in, status = 'office', updated_by = excluded.updated_by, updated_at = now()
      where staff_attendance.status = 'absent'`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/attendance', 'page');
  return {};
}
