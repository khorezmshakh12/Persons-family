'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { canFor } from '@/lib/permissions';
import { FINANCE_METRICS, OKR_METRIC_IDS, type OkrMetric } from '@/lib/strategy-okr';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

async function requireOkrEditor(): Promise<{ id: string; finance: boolean } | { error: string }> {
  try {
    const { profile } = await requireCap('strategy.edit');
    return { id: profile.id, finance: canFor(profile, 'strategy.finance') };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

function done(): Result {
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const objectiveSchema = z.object({
  id: z.string().uuid().optional(),
  spaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  ownerId: z.string().uuid().nullable(),
});

export async function saveObjectiveAction(input: z.input<typeof objectiveSchema>): Promise<Result<{ id: string }>> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  const p = objectiveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const rows = v.id
      ? await sql<{ id: string }[]>`
          update strategy_objectives set title = ${v.title}, owner_id = ${v.ownerId}
          where id = ${v.id} and space_id = ${v.spaceId} returning id`
      : await sql<{ id: string }[]>`
          insert into strategy_objectives (space_id, title, owner_id, created_by, sort_order)
          values (${v.spaceId}, ${v.title}, ${v.ownerId}, ${g.id},
                  (select coalesce(max(sort_order), 0) + 1 from strategy_objectives where space_id = ${v.spaceId}))
          returning id`;
    if (rows.length === 0) return { error: 'notFound' };
    done();
    return { id: rows[0].id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteObjectiveAction(id: string): Promise<Result> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from strategy_objectives where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const num = z.number().finite().min(-1e12).max(1e12);
const krSchema = z.object({
  id: z.string().uuid().optional(),
  objectiveId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  metric: z.enum(OKR_METRIC_IDS as [OkrMetric, ...OkrMetric[]]),
  startValue: num,
  targetValue: num,
  currentValue: num.default(0),
  unit: z.string().trim().max(20).default(''),
});

export async function saveKeyResultAction(input: z.input<typeof krSchema>): Promise<Result<{ id: string }>> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  const p = krSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  // Money metrics are only for those who may see the books.
  if (FINANCE_METRICS.includes(v.metric) && !g.finance) return { error: 'forbidden' };
  try {
    const rows = v.id
      ? await sql<{ id: string }[]>`
          update strategy_key_results set
            title = ${v.title}, metric = ${v.metric}, start_value = ${v.startValue}, target_value = ${v.targetValue},
            current_value = ${v.currentValue}, unit = ${v.unit}, updated_at = now()
          where id = ${v.id} and objective_id = ${v.objectiveId} returning id`
      : await sql<{ id: string }[]>`
          insert into strategy_key_results (objective_id, title, metric, start_value, target_value, current_value, unit, sort_order)
          values (${v.objectiveId}, ${v.title}, ${v.metric}, ${v.startValue}, ${v.targetValue}, ${v.currentValue}, ${v.unit},
                  (select coalesce(max(sort_order), 0) + 1 from strategy_key_results where objective_id = ${v.objectiveId}))
          returning id`;
    if (rows.length === 0) return { error: 'notFound' };
    done();
    return { id: rows[0].id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteKeyResultAction(id: string): Promise<Result> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from strategy_key_results where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}
