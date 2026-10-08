'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { canFor } from '@/lib/permissions';
import { FINANCE_METRICS, OKR_METRIC_IDS, krProgress, type OkrMetric } from '@/lib/strategy-okr';
import { getAuthState } from '@/lib/auth/session';
import { askTypeSafe, typesafeEnabled } from '@/lib/typesafe';
import { loadOkr } from '@/lib/strategy-okr-data';
import { quarterElapsed, quarterOf, weekOf } from '@/lib/strategy-plan';
import { tashkentDayKey } from '@/lib/time';

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
  quarter: z
    .string()
    .regex(/^\d{4}-Q[1-4]$/)
    .nullable()
    .optional(),
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
          update strategy_objectives set title = ${v.title}, owner_id = ${v.ownerId},
            quarter = ${v.quarter === undefined ? sql`quarter` : v.quarter}
          where id = ${v.id} and space_id = ${v.spaceId} returning id`
      : await sql<{ id: string }[]>`
          insert into strategy_objectives (space_id, title, owner_id, quarter, created_by, sort_order)
          values (${v.spaceId}, ${v.title}, ${v.ownerId}, ${v.quarter ?? null}, ${g.id},
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
  ownerId: z.string().uuid().nullable().optional(),
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
            current_value = ${v.currentValue}, unit = ${v.unit}, updated_at = now(),
            owner_id = ${v.ownerId === undefined ? sql`owner_id` : v.ownerId}
          where id = ${v.id} and objective_id = ${v.objectiveId} returning id`
      : await sql<{ id: string }[]>`
          insert into strategy_key_results (objective_id, title, metric, start_value, target_value, current_value, unit, owner_id, sort_order)
          values (${v.objectiveId}, ${v.title}, ${v.metric}, ${v.startValue}, ${v.targetValue}, ${v.currentValue}, ${v.unit}, ${v.ownerId ?? null},
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

/* ------------------------------------------------------------ Strategy v2 */

const uuid = z.string().uuid();

/** Which strategy tasks drive a key result (replaces the set). */
export async function setKrTasksAction(krId: string, taskIds: string[]): Promise<Result> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  const p = z.object({ krId: uuid, taskIds: z.array(uuid).max(200) }).safeParse({ krId, taskIds });
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      // Only tasks from the KR's own space.
      const [kr] = await tx<{ space_id: string }[]>`
        select o.space_id from strategy_key_results k join strategy_objectives o on o.id = k.objective_id where k.id = ${p.data.krId}`;
      if (!kr) throw new Error('notFound');
      await tx`delete from strategy_kr_tasks where kr_id = ${p.data.krId}`;
      if (p.data.taskIds.length) {
        const ok = await tx<{ id: string }[]>`select id from strategy_tasks where space_id = ${kr.space_id} and id in ${tx(p.data.taskIds)}`;
        if (ok.length) await tx`insert into strategy_kr_tasks ${tx(ok.map((t) => ({ kr_id: p.data.krId, task_id: t.id })))}`;
      }
    });
  } catch (error) {
    return { error: error instanceof Error && error.message === 'notFound' ? 'notFound' : 'updateFailed' };
  }
  return done();
}

const checkinSchema = z.object({
  krId: uuid,
  value: num.nullable().optional(),
  confidence: z.enum(['on', 'risk', 'off']),
  note: z.string().trim().max(500).optional().default(''),
});

/** This week's check-in for a key result (one per week — a second one
 * replaces it). Manual KRs take the typed value as their new current. */
export async function checkInKrAction(input: z.input<typeof checkinSchema>): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const p = checkinSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const [kr] = await sql<{ metric: string; owner_id: string | null; obj_owner: string | null }[]>`
    select k.metric, k.owner_id, o.owner_id as obj_owner from strategy_key_results k
    join strategy_objectives o on o.id = k.objective_id where k.id = ${p.data.krId}`;
  if (!kr) return { error: 'notFound' };
  // Strategy editors, or the KR / objective owner themselves.
  if (!canFor(profile, 'strategy.edit') && kr.owner_id !== user.id && kr.obj_owner !== user.id) return { error: 'forbidden' };
  const week = weekOf(tashkentDayKey());
  const value = kr.metric === 'manual' ? (p.data.value ?? null) : null;
  try {
    await sql.begin(async (tx) => {
      await tx`
        insert into strategy_checkins (kr_id, week, value, confidence, note, author_id)
        values (${p.data.krId}, ${week}, ${value}, ${p.data.confidence}, ${p.data.note || null}, ${user.id})
        on conflict (kr_id, week) do update set value = excluded.value, confidence = excluded.confidence,
          note = excluded.note, author_id = excluded.author_id, created_at = now()`;
      if (value !== null) await tx`update strategy_key_results set current_value = ${value}, updated_at = now() where id = ${p.data.krId}`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const closeSchema = z.object({ id: uuid, score: z.number().min(0).max(1), retro: z.string().trim().max(1000).optional().default('') });

/** End-of-quarter grade (0–1, Google style) and a short retro. */
export async function closeObjectiveAction(input: z.input<typeof closeSchema>): Promise<Result> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  const p = closeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update strategy_objectives set status = 'closed', final_score = ${Math.round(p.data.score * 100) / 100},
        retro = ${p.data.retro || null}, closed_at = now()
      where id = ${p.data.id} and status = 'active'`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function reopenObjectiveAction(id: string): Promise<Result> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`update strategy_objectives set status = 'active', closed_at = null where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/**
 * Jev reads each active key result's numbers — start, target, current,
 * how much of the quarter is gone, the check-in trend and the owner's
 * confidence — and answers one choice: will it land? Typed verdicts only.
 */
export async function forecastKrsAction(spaceId: string): Promise<Result<{ judged: number }>> {
  const g = await requireOkrEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(spaceId).success) return { error: 'invalidInput' };
  if (!typesafeEnabled()) return { error: 'aiDisabled' };
  const today = tashkentDayKey();
  const objectives = (await loadOkr(spaceId, g.finance)).filter((o) => o.status === 'active');
  const krs = objectives.flatMap((o) => o.krs.map((k) => ({ k, quarter: o.quarter ?? quarterOf(today) }))).filter(({ k }) => k.current !== null);
  if (!krs.length) return { judged: 0 };

  const questions = Object.fromEntries(
    krs.map((_, i) => [
      `kr${i}`,
      {
        type: 'choice' as const,
        instructions: `Will key result #${i} reach its target by the end of its quarter, judged from its progress so far versus time elapsed, its weekly trend and the owner's confidence?`,
        criteria: {
          likely: 'On pace or ahead: progress keeps up with elapsed time, trend rising, confidence mostly on track.',
          risk: 'Behind pace but recoverable: noticeable gap or flat trend, or confidence at risk.',
          unlikely: 'Far behind with little time left, falling or flat trend, or confidence off track.',
        },
      },
    ]),
  );
  const state = {
    today,
    key_results: krs.map(({ k, quarter }, i) => ({
      index: i,
      title: k.title,
      start: k.start_value,
      target: k.target_value,
      current: k.current,
      progress_pct: krProgress(k),
      quarter_elapsed_pct: quarterElapsed(quarter, today),
      weekly_values: k.checkins.map((c) => c.value).filter((v) => v !== null),
      weekly_confidence: k.checkins.map((c) => c.confidence),
    })),
  };
  const res = await askTypeSafe(state, questions, 'strategy-okr');
  if (!res) return { error: 'aiFailed' };
  let judged = 0;
  for (const [i, { k }] of krs.entries()) {
    const a = res.answers[`kr${i}`];
    if (a?.type !== 'choice' || !['likely', 'risk', 'unlikely'].includes(a.choice)) continue;
    const ok = await sql`update strategy_key_results set jev_verdict = ${a.choice}, jev_at = now() where id = ${k.id}`
      .then((r) => r.count > 0)
      .catch(() => false);
    if (ok) judged++;
  }
  done();
  return { judged };
}
