'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
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
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = upsertPlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  // The CEO doesn't self-certify their own roadmap — mirrors the same rule
  // on KPI scoring and self-development evaluations.
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`
      insert into staff_income_plans (staff_id, year, base_monthly_income, target_year_end_income)
      values (${parsed.data.staffId}, ${parsed.data.year}, ${parsed.data.baseMonthlyIncome}, ${parsed.data.targetYearEndIncome})
      on conflict (staff_id, year) do update set
        base_monthly_income = excluded.base_monthly_income,
        target_year_end_income = excluded.target_year_end_income
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
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
  if (parsed.data.staffId === adminId) return { error: 'forbidden' };

  try {
    await sql`
      insert into income_roadmap_steps (plan_id, target_amount, target_month, benefit_description, created_by)
      values (${parsed.data.planId}, ${parsed.data.targetAmount}, ${parsed.data.targetMonth}, ${parsed.data.benefitDescription}, ${adminId})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction(
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
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = markAchievedSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`
      update income_roadmap_steps set status = 'achieved', achieved_at = now() where id = ${parsed.data.stepId}
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}

const deleteStepSchema = z.object({ stepId: z.string().uuid(), staffId: z.string().uuid() });

export async function deleteIncomeStepAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteStepSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`delete from income_roadmap_steps where id = ${parsed.data.stepId}`;
  } catch {
    return { error: 'deleteFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}
