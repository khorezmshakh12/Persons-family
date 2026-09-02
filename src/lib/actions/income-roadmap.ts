'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';

/**
 * Income Roadmap — CEO-managed, employee-read-only.
 *
 * The model is a 12-month grid per (staff, year):
 *   income_roadmaps            baseline + headline year-end target + status
 *   income_roadmap_months      month_number 1..12, planned_income + actual_income
 *   income_roadmap_milestones  named checkpoints anchored to a month
 *
 * Nothing derived is stored — variance, MoM growth %, cumulative plan vs
 * actual and attainment are all computed from planned/actual at read time
 * (see `src/components/income-roadmap/data.ts`).
 *
 * Every action here re-checks CEO itself (a page guard is not a security
 * boundary), validates with zod, wraps its writes in try/catch and returns
 * `{ error: code }` — never throwing out of the action.
 *
 * Ownership: the client only ever sends an id. Milestone/month writes are
 * scoped through `income_roadmaps.staff_id` inside the SQL so a forged id
 * belonging to another employee's roadmap matches zero rows and comes back
 * as `notFound`, rather than being trusted because the shape validated.
 */

export type IncomeRoadmapActionState = { error?: string } | undefined;

function revalidateFinance(staffId: string) {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath(`/[locale]/finance/${staffId}`, 'page');
}

/** Shared preamble: CEO-only, and the CEO never manages their own roadmap
 * (mirrors the same self-certification rule on KPI scoring and
 * self-development evaluations). */
async function requireRoadmapManager(staffId: string): Promise<
  { ok: true; ceoId: string } | { ok: false; error: string }
> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { ok: false, error: authErrorCode(error) };
  }
  if (staffId === ceoId) return { ok: false, error: 'forbidden' };
  return { ok: true, ceoId };
}

const uuid = z.string().uuid();
const yearField = z.coerce.number().int().min(2020).max(2100);
const monthField = z.coerce.number().int().min(1).max(12);
const moneyField = z.coerce.number().min(0).max(1_000_000_000_000);

// ---------------------------------------------------------------------------
// Roadmap header
// ---------------------------------------------------------------------------

const upsertRoadmapSchema = z.object({
  staffId: uuid,
  year: yearField,
  baselineMonthlyIncome: moneyField,
  targetYearEndIncome: moneyField,
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  notes: z.string().trim().max(4000).optional().transform((v) => v || undefined),
});

/**
 * Create or update the roadmap header for one (staff, year) and make sure
 * the 12 month rows exist. The seed leaves any month the CEO has already
 * filled in untouched (`on conflict do nothing`), so re-saving the header
 * never wipes the plan.
 */
export async function upsertIncomeRoadmapAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = upsertRoadmapSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, year, baselineMonthlyIncome, targetYearEndIncome, status, notes } = parsed.data;

  try {
    const [roadmap] = await sql<{ id: string }[]>`
      insert into income_roadmaps
        (staff_id, year, baseline_monthly_income, target_year_end_income, status, notes, created_by)
      values (${staffId}, ${year}, ${baselineMonthlyIncome}, ${targetYearEndIncome},
              ${status}, ${notes ?? null}, ${gate.ceoId})
      on conflict (staff_id, year) do update set
        baseline_monthly_income = excluded.baseline_monthly_income,
        target_year_end_income  = excluded.target_year_end_income,
        status                  = excluded.status,
        notes                   = excluded.notes,
        updated_at              = now()
      returning id
    `;

    // A roadmap always has all 12 slots, so the grid and the chart never
    // have to reason about holes.
    await sql`
      insert into income_roadmap_months (roadmap_id, month_number, planned_income)
      select ${roadmap.id}::uuid, n, 0 from generate_series(1, 12) as n
      on conflict (roadmap_id, month_number) do nothing
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'income_roadmap.upsert',
    `Saved ${year} income roadmap for staff ${staffId}: baseline ${baselineMonthlyIncome}, year-end target ${targetYearEndIncome}`,
  );

  revalidateFinance(staffId);
  return {};
}

const deleteRoadmapSchema = z.object({ staffId: uuid, roadmapId: uuid });

/** Deletes the header; months and milestones go with it (on delete cascade). */
export async function deleteIncomeRoadmapAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = deleteRoadmapSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  try {
    const deleted = await sql`
      delete from income_roadmaps
      where id = ${parsed.data.roadmapId} and staff_id = ${parsed.data.staffId}
      returning id
    `;
    if (deleted.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'deleteFailed' };
  }

  logSystemAction('income_roadmap.delete', `Deleted income roadmap ${parsed.data.roadmapId}`);

  revalidateFinance(parsed.data.staffId);
  return {};
}

// ---------------------------------------------------------------------------
// Month grid — planned
// ---------------------------------------------------------------------------

const savePlanSchema = z.object({ staffId: uuid, roadmapId: uuid });

/**
 * Saves the whole 12-month planned curve in one submit, from the fields
 * `planned-1` … `planned-12`. Bulk rather than per-month because a plan is
 * edited as a curve — changing one month in isolation almost always means
 * the rest were meant to shift too, and 12 separate actions would be
 * dispatched one at a time by the client anyway.
 */
export async function saveMonthlyPlanAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = savePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const rows: { month_number: number; planned_income: number }[] = [];
  for (let month = 1; month <= 12; month += 1) {
    // A missing field must not coerce to 0 and silently wipe that month's
    // plan — the editor always submits all twelve.
    const raw = formData.get(`planned-${month}`);
    if (raw === null) return { error: 'invalidInput' };
    const value = moneyField.safeParse(raw);
    if (!value.success) return { error: 'invalidInput' };
    rows.push({ month_number: month, planned_income: value.data });
  }

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, roadmapId } = parsed.data;

  try {
    // Scoped through the roadmap's own staff_id, so a roadmapId belonging to
    // someone else selects nothing.
    const [owned] = await sql<{ id: string }[]>`
      select id from income_roadmaps where id = ${roadmapId} and staff_id = ${staffId}
    `;
    if (!owned) return { error: 'notFound' };

    await sql`
      insert into income_roadmap_months ${sql(
        rows.map((r) => ({ roadmap_id: roadmapId, ...r })),
        'roadmap_id',
        'month_number',
        'planned_income',
      )}
      on conflict (roadmap_id, month_number) do update set
        planned_income = excluded.planned_income,
        updated_at     = now()
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction('income_roadmap.plan_save', `Saved the 12-month income plan for staff ${staffId}`);

  revalidateFinance(staffId);
  return {};
}

// ---------------------------------------------------------------------------
// Month grid — actuals
// ---------------------------------------------------------------------------

const recordActualSchema = z.object({
  staffId: uuid,
  roadmapId: uuid,
  monthNumber: monthField,
  actualIncome: moneyField,
  note: z.string().trim().max(2000).optional().transform((v) => v || undefined),
});

/**
 * Records what the employee actually earned in one closed month. NULL means
 * "not reported yet" and 0 is a genuine reported zero, so this never writes
 * NULL — use `clearMonthActualAction` to undo a mistaken entry.
 */
export async function recordMonthActualAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = recordActualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, roadmapId, monthNumber, actualIncome, note } = parsed.data;

  try {
    const updated = await sql`
      update income_roadmap_months m set
        actual_income      = ${actualIncome},
        actual_recorded_at = now(),
        actual_recorded_by = ${gate.ceoId},
        note               = ${note ?? null},
        updated_at         = now()
      from income_roadmaps r
      where m.roadmap_id = r.id
        and r.id = ${roadmapId}
        and r.staff_id = ${staffId}
        and m.month_number = ${monthNumber}
      returning m.id
    `;
    if (updated.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  logSystemAction(
    'income_roadmap.actual_record',
    `Recorded month ${monthNumber} actual income ${actualIncome} for staff ${staffId}`,
  );

  revalidateFinance(staffId);
  return {};
}

const clearActualSchema = z.object({ staffId: uuid, roadmapId: uuid, monthNumber: monthField });

/** Puts a month back to "not reported yet". */
export async function clearMonthActualAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = clearActualSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  try {
    const updated = await sql`
      update income_roadmap_months m set
        actual_income      = null,
        actual_recorded_at = null,
        actual_recorded_by = null,
        updated_at         = now()
      from income_roadmaps r
      where m.roadmap_id = r.id
        and r.id = ${parsed.data.roadmapId}
        and r.staff_id = ${parsed.data.staffId}
        and m.month_number = ${parsed.data.monthNumber}
      returning m.id
    `;
    if (updated.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

const milestoneFields = {
  title: z.string().trim().min(1).max(160),
  targetMonth: monthField,
  targetIncome: moneyField,
  criteria: z.string().trim().max(2000).optional().transform((v) => v || undefined),
};

const createMilestoneSchema = z.object({ staffId: uuid, roadmapId: uuid, ...milestoneFields });

export async function createMilestoneAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = createMilestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, roadmapId, title, targetMonth, targetIncome, criteria } = parsed.data;

  try {
    const inserted = await sql`
      insert into income_roadmap_milestones
        (roadmap_id, title, target_month, target_income, criteria, sort_order, created_by)
      select r.id, ${title}::text, ${targetMonth}::int, ${targetIncome}::numeric, ${criteria ?? null}::text,
             coalesce((select max(sort_order) + 1 from income_roadmap_milestones where roadmap_id = r.id), 0),
             ${gate.ceoId}::uuid
      from income_roadmaps r
      where r.id = ${roadmapId} and r.staff_id = ${staffId}
      returning id
    `;
    if (inserted.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction(
    'income_roadmap.milestone_create',
    `Added income milestone "${title}" (month ${targetMonth}, ${targetIncome}) for staff ${staffId}`,
  );

  revalidateFinance(staffId);
  return {};
}

const updateMilestoneSchema = z.object({ staffId: uuid, milestoneId: uuid, ...milestoneFields });

export async function updateMilestoneAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = updateMilestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, milestoneId, title, targetMonth, targetIncome, criteria } = parsed.data;

  try {
    const updated = await sql`
      update income_roadmap_milestones m set
        title         = ${title},
        target_month  = ${targetMonth},
        target_income = ${targetIncome},
        criteria      = ${criteria ?? null},
        updated_at    = now()
      from income_roadmaps r
      where m.roadmap_id = r.id and m.id = ${milestoneId} and r.staff_id = ${staffId}
      returning m.id
    `;
    if (updated.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateFinance(staffId);
  return {};
}

const setMilestoneStatusSchema = z.object({
  staffId: uuid,
  milestoneId: uuid,
  status: z.enum(['planned', 'in_progress', 'achieved', 'missed']),
});

/** `achieved_at` is stamped when the status becomes 'achieved' and cleared
 * when it moves back off, so the timestamp can never describe a milestone
 * that isn't achieved any more. */
export async function setMilestoneStatusAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = setMilestoneStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  const { staffId, milestoneId, status } = parsed.data;

  try {
    const updated = await sql`
      update income_roadmap_milestones m set
        status      = ${status},
        achieved_at = case when ${status}::text = 'achieved' then coalesce(m.achieved_at, now()) else null end,
        updated_at  = now()
      from income_roadmaps r
      where m.roadmap_id = r.id and m.id = ${milestoneId} and r.staff_id = ${staffId}
      returning m.id
    `;
    if (updated.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateFinance(staffId);
  return {};
}

const deleteMilestoneSchema = z.object({ staffId: uuid, milestoneId: uuid });

export async function deleteMilestoneAction(
  _prevState: IncomeRoadmapActionState,
  formData: FormData,
): Promise<IncomeRoadmapActionState> {
  const parsed = deleteMilestoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const gate = await requireRoadmapManager(parsed.data.staffId);
  if (!gate.ok) return { error: gate.error };

  try {
    const deleted = await sql`
      delete from income_roadmap_milestones m
      using income_roadmaps r
      where m.roadmap_id = r.id
        and m.id = ${parsed.data.milestoneId}
        and r.staff_id = ${parsed.data.staffId}
      returning m.id
    `;
    if (deleted.length === 0) return { error: 'notFound' };
  } catch {
    return { error: 'deleteFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}
