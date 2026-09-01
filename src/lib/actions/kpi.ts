'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';

export type KpiActionState = { error?: string } | undefined;

function revalidateFinance(staffId: string) {
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath(`/[locale]/finance/${staffId}`, 'page');
}

const addMetricSchema = z.object({
  staffId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  weightPercentage: z.coerce.number().int().min(1).max(100),
});

export async function addKpiMetricAction(
  _prevState: KpiActionState,
  formData: FormData,
): Promise<KpiActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  // The CEO doesn't self-score — mirrors SelfDevelopmentSection's
  // `isAdmin && !isSelf` gate one section below on the same page.
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`
      insert into kpi_metrics (staff_id, name, weight_percentage)
      values (${parsed.data.staffId}, ${parsed.data.name}, ${parsed.data.weightPercentage})
    `;
  } catch {
    return { error: 'createFailed' };
  }

  logSystemAction('kpi.metric_add', `Added KPI metric "${parsed.data.name}" for staff ${parsed.data.staffId}`);

  revalidateFinance(parsed.data.staffId);
  return {};
}

const updateMetricSchema = z.object({
  metricId: z.string().uuid(),
  staffId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  weightPercentage: z.coerce.number().int().min(1).max(100),
});

export async function updateKpiMetricAction(
  _prevState: KpiActionState,
  formData: FormData,
): Promise<KpiActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  // Bind the metric to the submitted staffId so a mismatched pair can't
  // slip the metric out from under the `staffId === ceoId` self-edit guard.
  try {
    const res = await sql`
      update kpi_metrics set name = ${parsed.data.name}, weight_percentage = ${parsed.data.weightPercentage}
      where id = ${parsed.data.metricId} and staff_id = ${parsed.data.staffId}
    `;
    if (res.count === 0) return { error: 'notFound' };
  } catch (error) {
    console.error('updateKpiMetricAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}

const deleteMetricSchema = z.object({ metricId: z.string().uuid(), staffId: z.string().uuid() });

export async function deleteKpiMetricAction(
  _prevState: KpiActionState,
  formData: FormData,
): Promise<KpiActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`delete from kpi_metrics where id = ${parsed.data.metricId} and staff_id = ${parsed.data.staffId}`;
  } catch (error) {
    console.error('deleteKpiMetricAction failed', error instanceof Error ? error.message : error);
    return { error: 'deleteFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}

const upsertEntrySchema = z.object({
  metricId: z.string().uuid(),
  staffId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetValue: z.coerce.number(),
  actualValue: z.coerce.number().optional(),
});

/** One target/actual pair per metric per month — CEO fills the target at
 * the start of the month and the actual once it's known, but both fields
 * share a single upsert since there's no workflow reason to keep them as
 * separate writes. */
export async function upsertKpiEntryAction(
  _prevState: KpiActionState,
  formData: FormData,
): Promise<KpiActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCeo());
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = upsertEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (parsed.data.staffId === ceoId) return { error: 'forbidden' };

  try {
    await sql`
      insert into kpi_entries (metric_id, month, target_value, actual_value)
      values (${parsed.data.metricId}, ${parsed.data.month}, ${parsed.data.targetValue}, ${parsed.data.actualValue ?? null})
      on conflict (metric_id, month) do update set
        target_value = excluded.target_value,
        actual_value = excluded.actual_value
    `;
  } catch {
    return { error: 'updateFailed' };
  }

  revalidateFinance(parsed.data.staffId);
  return {};
}
