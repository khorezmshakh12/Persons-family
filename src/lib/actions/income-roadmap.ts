'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
import { logSystemAction } from '@/lib/audit-log';

export type IncomeRoadmapActionState = { error?: string } | undefined;

function revalidateFinance(staffId: string) {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath(`/[locale]/finance/${staffId}`, 'page');
}

const upsertPlanSchema = z.object({
  staffId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  baseMonthlyIncome: z.coerce.number().min(0),
  targetYearEndIncome: z.coerce.number().min(0),
});

/** One plan per staff member per year — the starting salary and the
 * year-end target it should grow toward. Steps (below) fill in the path
 * between the two. */
export async function upsertIncomePlanAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = upsertPlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('staff_income_plans').upsert(
    {
      staff_id: parsed.data.staffId,
      year: parsed.data.year,
      base_monthly_income: parsed.data.baseMonthlyIncome,
      target_year_end_income: parsed.data.targetYearEndIncome,
    },
    { onConflict: 'staff_id,year' },
  );
  if (error) return { error: 'updateFailed' };

  logSystemAction(
    supabase,
    'income_roadmap.plan_upsert',
    `Set ${parsed.data.year} income plan for staff ${parsed.data.staffId}: ${parsed.data.baseMonthlyIncome} -> ${parsed.data.targetYearEndIncome}`,
  );

  revalidateFinance(parsed.data.staffId);
  return {};
}

const addStepSchema = z.object({
  planId: z.string().uuid(),
  staffId: z.string().uuid(),
  targetAmount: z.coerce.number().min(0),
  // <input type="month"> submits "YYYY-MM" — normalize to the 1st of that
  // month to match the date column.
  targetMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .transform((v) => `${v}-01`),
  benefitDescription: z.string().trim().min(1).max(2000),
});

export async function addIncomeStepAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  let adminId: string;
  try {
    ({
      user: { id: adminId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addStepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('income_roadmap_steps').insert({
    plan_id: parsed.data.planId,
    target_amount: parsed.data.targetAmount,
    target_month: parsed.data.targetMonth,
    benefit_description: parsed.data.benefitDescription,
    created_by: adminId,
  });
  if (error) return { error: 'createFailed' };

  logSystemAction(
    supabase,
    'income_roadmap.step_add',
    `Added income step ${parsed.data.targetAmount} for staff ${parsed.data.staffId}`,
  );

  revalidateFinance(parsed.data.staffId);
  return {};
}

const markAchievedSchema = z.object({ stepId: z.string().uuid(), staffId: z.string().uuid() });

export async function markStepAchievedAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = markAchievedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('income_roadmap_steps')
    .update({ status: 'achieved', achieved_at: new Date().toISOString() })
    .eq('id', parsed.data.stepId);
  if (error) return { error: 'updateFailed' };

  revalidateFinance(parsed.data.staffId);
  return {};
}

const deleteStepSchema = z.object({ stepId: z.string().uuid(), staffId: z.string().uuid() });

export async function deleteIncomeStepAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteStepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('income_roadmap_steps').delete().eq('id', parsed.data.stepId);
  if (error) return { error: 'deleteFailed' };

  revalidateFinance(parsed.data.staffId);
  return {};
}
