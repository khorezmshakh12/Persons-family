'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { requireStrategyEditor } from '@/lib/strategy-auth';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { normalizeBudget, type StrategyMind, type StrategySpace, type StrategyTask } from '@/lib/strategy';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const taskSchema = z
  .object({
    id: z.string().uuid().optional(),
    spaceId: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    description: z.string().max(5000).default(''),
    workstream: z.enum(['aka', 'it', 'mkt', 'fil', 'mol', 'hr']),
    assigneeId: z.string().uuid().nullable(),
    startDate: ymd,
    endDate: ymd,
    status: z.enum(['todo', 'progress', 'review', 'done']),
    priority: z.enum(['high', 'med', 'low']),
    progress: z.number().int().min(0).max(100),
    roadmapId: z.string().uuid().nullable().optional(),
    roadmapNode: z.string().max(40).nullable().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'endBeforeStart' });

const TASK_COLUMNS = sql`
  id, space_id, title, description, workstream, assignee_id, start_date, end_date,
  status, priority, progress, roadmap_id, roadmap_node
`;

export async function saveStrategyTaskAction(input: z.input<typeof taskSchema>): Promise<Result<{ task: StrategyTask }>> {
  let profileId: string;
  try {
    ({ profile: { id: profileId } } = await requireStrategyEditor());
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidInput' };
  const v = parsed.data;
  // Done always means 100%, and a task sent back to "todo" from done starts over.
  const progress = v.status === 'done' ? 100 : v.progress;

  try {
    if (v.assigneeId) {
      const [ok] = await sql`select 1 from profiles where id = ${v.assigneeId} and is_active = true`;
      if (!ok) return { error: 'invalidInput' };
    }
    const rows = v.id
      ? await sql<StrategyTask[]>`
          update strategy_tasks set
            title = ${v.title}, description = ${v.description}, workstream = ${v.workstream},
            assignee_id = ${v.assigneeId}, start_date = ${v.startDate}, end_date = ${v.endDate},
            status = ${v.status}, priority = ${v.priority}, progress = ${progress}, updated_at = now(),
            done_at = case when ${v.status} = 'done' then coalesce(done_at, now()) else null end
          where id = ${v.id} and space_id = ${v.spaceId}
          returning ${TASK_COLUMNS}`
      : await sql<StrategyTask[]>`
          insert into strategy_tasks (space_id, title, description, workstream, assignee_id, start_date, end_date,
            status, priority, progress, roadmap_id, roadmap_node, created_by, done_at)
          values (${v.spaceId}, ${v.title}, ${v.description}, ${v.workstream}, ${v.assigneeId}, ${v.startDate},
            ${v.endDate}, ${v.status}, ${v.priority}, ${progress}, ${v.roadmapId ?? null}, ${v.roadmapNode ?? null},
            ${profileId}, ${v.status === 'done' ? sql`now()` : null})
          returning ${TASK_COLUMNS}`;
    if (rows.length === 0) return { error: 'notFound' };
    if (!v.id) logSystemAction('strategy.task.create', `Strategy task "${v.title}"`);
    revalidatePath('/[locale]/strategy', 'page');
    return { task: rows[0] };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteStrategyTaskAction(taskId: string): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(taskId).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from strategy_tasks where id = ${taskId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('strategy.task.delete', `Deleted strategy task ${taskId}`);
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const nodeSchema = z.object({
  roadmapId: z.string().uuid(),
  nodeId: z.string().regex(/^[a-z0-9-]{1,20}$/),
  status: z.enum(['todo', 'progress', 'done', 'skip']),
});

export async function setRoadmapNodeStatusAction(input: z.input<typeof nodeSchema>): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = nodeSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidInput' };
  const { roadmapId, nodeId, status } = parsed.data;
  try {
    // jsonb_set on one key — two editors toggling different nodes never clobber each other.
    const res = await sql`
      update strategy_roadmaps
      set node_status = jsonb_set(node_status, ${[nodeId]}::text[], to_jsonb(${status}::text), true)
      where id = ${roadmapId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const mindSchema: z.ZodType<StrategyMind> = z.object({
  t: z.string().max(80),
  ch: z
    .array(
      z.object({
        t: z.string().trim().min(1).max(80),
        c: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        ws: z.enum(['aka', 'it', 'mkt', 'fil', 'mol', 'hr']).optional(),
        ch: z.array(z.object({ t: z.string().trim().min(1).max(80) })).max(12),
      }),
    )
    .max(12),
});

export async function saveStrategyMindAction(spaceId: string, mind: StrategyMind): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = mindSchema.safeParse(mind);
  if (!parsed.success || !z.string().uuid().safeParse(spaceId).success) return { error: 'invalidInput' };
  try {
    const res = await sql`update strategy_spaces set mind = ${sql.json(parsed.data)} where id = ${spaceId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const spaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  startDate: ymd,
  endDate: ymd,
});

export async function createStrategySpaceAction(input: z.input<typeof spaceSchema>): Promise<Result<{ id: string }>> {
  let profileId: string;
  try {
    ({ profile: { id: profileId } } = await requireStrategyEditor());
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = spaceSchema.safeParse(input);
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) return { error: 'invalidInput' };
  const v = parsed.data;
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into strategy_spaces (name, subtitle, color, start_date, end_date, mind, sort_order, created_by)
      values (${v.name}, ${v.subtitle}, ${v.color}, ${v.startDate}, ${v.endDate},
        ${sql.json({ t: v.name, ch: [] })},
        (select coalesce(max(sort_order), 0) + 1 from strategy_spaces), ${profileId})
      returning id`;
    logSystemAction('strategy.space.create', `Strategy space "${v.name}"`);
    revalidatePath('/[locale]/strategy', 'page');
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

const milestoneSchema = z.object({ spaceId: z.string().uuid(), title: z.string().trim().min(1).max(200), date: ymd });

export async function addStrategyMilestoneAction(
  input: z.input<typeof milestoneSchema>,
): Promise<Result<{ milestone: { id: string; title: string; date: string } }>> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ id: string; title: string; date: string }[]>`
      insert into strategy_milestones (space_id, title, date)
      values (${parsed.data.spaceId}, ${parsed.data.title}, ${parsed.data.date})
      returning id, title, date`;
    revalidatePath('/[locale]/strategy', 'page');
    return { milestone: row };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteStrategyMilestoneAction(id: string): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from strategy_milestones where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const spaceUpdateSchema = spaceSchema.extend({ id: z.string().uuid() });

export async function updateStrategySpaceAction(input: z.input<typeof spaceUpdateSchema>): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = spaceUpdateSchema.safeParse(input);
  if (!parsed.success || parsed.data.endDate < parsed.data.startDate) return { error: 'invalidInput' };
  const v = parsed.data;
  try {
    const res = await sql`
      update strategy_spaces set name = ${v.name}, subtitle = ${v.subtitle}, color = ${v.color},
        start_date = ${v.startDate}, end_date = ${v.endDate}
      where id = ${v.id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('strategy.space.update', `Strategy space "${v.name}"`);
  revalidatePath('/[locale]/strategy', 'page');
  revalidatePath('/[locale]/perforce', 'page');
  return {};
}

/** Deletes a space with its tasks and milestones (FK on delete cascade). */
export async function deleteStrategySpaceAction(id: string): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const rows = await sql<{ name: string }[]>`delete from strategy_spaces where id = ${id} returning name`;
    if (rows.length === 0) return { error: 'notFound' };
    logSystemAction('strategy.space.delete', `Deleted strategy space "${rows[0].name}"`);
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  revalidatePath('/[locale]/perforce', 'page');
  return {};
}

const budgetSchema = z
  .array(
    z.object({
      ws: z.enum(['aka', 'it', 'mkt', 'fil', 'mol', 'hr']),
      plan: z.number().finite().min(0).max(1e9),
      act: z.number().finite().min(0).max(1e9),
    }),
  )
  .max(6)
  .refine((rows) => new Set(rows.map((r) => r.ws)).size === rows.length, { message: 'duplicateWorkstream' });

/** Per-workstream plan / actual (million so'm) for a space. */
export async function saveStrategyBudgetAction(
  spaceId: string,
  budget: StrategySpace['budget'],
): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = budgetSchema.safeParse(budget);
  if (!parsed.success || !z.string().uuid().safeParse(spaceId).success) return { error: 'invalidInput' };
  const rows = normalizeBudget(parsed.data);
  try {
    const res = await sql`update strategy_spaces set budget = ${sql.json(rows)} where id = ${spaceId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}
