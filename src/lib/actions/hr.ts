'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { can } from '@/lib/permissions';

type Result = { error?: string };

/** The default first-week checklist for a new employee or intern. */
const ONBOARDING_TEMPLATE = [
  'Mehnat shartnomasi va hujjatlar topshirildi',
  'Platformaga kirish va Telegram bot ulandi',
  'Jamoa va rahbar bilan tanishuv',
  'Ichki qoidalar va jadval tushuntirildi',
  'Birinchi hafta vazifalari berildi',
  'Birinchi oy KPI rejasi tuzildi',
  '1-hafta yakuni: rahbar bilan suhbat',
];

const employmentSchema = z.object({
  userId: z.string().uuid(),
  hireDate: z.iso.date().nullable(),
  probationUntil: z.iso.date().nullable(),
});

/** Hire date and probation end (tenure, anniversaries, probation reminders). */
export async function updateEmploymentAction(input: z.input<typeof employmentSchema>): Promise<Result> {
  try {
    await requireCap('staff.manage');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = employmentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update profiles set hire_date = ${p.data.hireDate}, probation_until = ${p.data.probationUntil}
      where id = ${p.data.userId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/hr', 'page');
  return {};
}

/** Seed the onboarding checklist for someone (once). */
export async function startOnboardingAction(userId: string): Promise<Result> {
  let by: string;
  try {
    ({ user: { id: by } } = await requireCap('staff.manage'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(userId).success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${'onboarding:' + userId}))`;
      const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from onboarding_items where user_id = ${userId}`;
      if (n === 0) {
        await tx`insert into onboarding_items ${tx(ONBOARDING_TEMPLATE.map((title, sort) => ({ user_id: userId, title, sort, created_by: by })))}`;
      }
    });
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/hr', 'page');
  return {};
}

const addSchema = z.object({ userId: z.string().uuid(), title: z.string().trim().min(1).max(200) });

export async function addOnboardingItemAction(input: z.input<typeof addSchema>): Promise<Result> {
  let by: string;
  try {
    ({ user: { id: by } } = await requireCap('staff.manage'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = addSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into onboarding_items (user_id, title, sort, created_by)
      values (${p.data.userId}, ${p.data.title},
        (select coalesce(max(sort), -1) + 1 from onboarding_items where user_id = ${p.data.userId}), ${by})`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/hr', 'page');
  return {};
}

/** Tick / untick an item — HR, or the new employee on their own list. */
export async function toggleOnboardingItemAction(itemId: string, done: boolean): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (!z.string().uuid().safeParse(itemId).success) return { error: 'invalidInput' };
  const manager = can(profile.role, 'staff.manage');
  try {
    const res = await sql`
      update onboarding_items set done_at = ${done ? sql`now()` : null}, done_by = ${done ? user.id : null}
      where id = ${itemId} and (${manager} or user_id = ${user.id})`;
    if (res.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/hr', 'page');
  return {};
}
