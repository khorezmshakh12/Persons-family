'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireCeo, authErrorCode } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';
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
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = addMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('kpi_metrics').insert({
    staff_id: parsed.data.staffId,
    name: parsed.data.name,
    weight_percentage: parsed.data.weightPercentage,
  });
  if (error) return { error: 'createFailed' };

  logSystemAction(supabase, 'kpi.metric_add', `Added KPI metric "${parsed.data.name}" for staff ${parsed.data.staffId}`);

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
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = updateMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('kpi_metrics')
    .update({ name: parsed.data.name, weight_percentage: parsed.data.weightPercentage })
    .eq('id', parsed.data.metricId);
  if (error) return { error: 'updateFailed' };

  revalidateFinance(parsed.data.staffId);
  return {};
}

const deleteMetricSchema = z.object({ metricId: z.string().uuid(), staffId: z.string().uuid() });

export async function deleteKpiMetricAction(
  _prevState: KpiActionState,
  formData: FormData,
): Promise<KpiActionState> {
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = deleteMetricSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('kpi_metrics').delete().eq('id', parsed.data.metricId);
  if (error) return { error: 'deleteFailed' };

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
  try {
    await requireCeo();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = upsertEntrySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  const supabase = await createClient();
  const { error } = await supabase.from('kpi_entries').upsert(
    {
      metric_id: parsed.data.metricId,
      month: parsed.data.month,
      target_value: parsed.data.targetValue,
      actual_value: parsed.data.actualValue ?? null,
    },
    { onConflict: 'metric_id,month' },
  );
  if (error) return { error: 'updateFailed' };

  revalidateFinance(parsed.data.staffId);
  return {};
}
