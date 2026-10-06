'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import type { StrategyRoadmap } from '@/lib/strategy';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

async function requireRoadmapEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('strategy.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

// Node ids are `${section.id}` for a stage and `${section.id}-l${i}` /
// `-r${i}` for its topics (see roadmapNodes in lib/strategy.ts), so a
// section id must leave room for the suffix inside the 20-char node id.
const sectionId = z.string().regex(/^[a-z0-9]{1,14}$/);
const nodeId = z.string().regex(/^[a-z0-9-]{1,20}$/);
const topic = z.string().trim().min(1).max(80);

const roadmapSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(80).default(''),
  icon: z.string().trim().min(1).max(2),
  sections: z
    .array(
      z.object({
        id: sectionId,
        t: z.string().trim().min(1).max(60),
        q: z.string().trim().max(30).default(''),
        left: z.array(topic).max(6),
        right: z.array(topic).max(6),
      }),
    )
    .max(12)
    .refine((s) => new Set(s.map((x) => x.id)).size === s.length, { message: 'duplicateSection' }),
  /** Old node id → new node id (null = removed). Carries node status, links
   * and linked tasks across renumbering when topics are added / removed. */
  remap: z.record(nodeId, nodeId.nullable()).default({}),
});

const COLS = sql`id, key, name, subtitle, icon, sections, node_status, node_links`;

export async function saveRoadmapAction(input: z.input<typeof roadmapSchema>): Promise<Result<{ roadmap: StrategyRoadmap }>> {
  const g = await requireRoadmapEditor();
  if ('error' in g) return g;
  const p = roadmapSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (!v.id) {
      const [row] = await sql<StrategyRoadmap[]>`
        insert into strategy_roadmaps (key, name, subtitle, icon, sections, sort_order)
        values (${`rm-${crypto.randomUUID().slice(0, 8)}`}, ${v.name}, ${v.subtitle}, ${v.icon}, ${sql.json(v.sections)},
                (select coalesce(max(sort_order), 0) + 1 from strategy_roadmaps))
        returning ${COLS}`;
      logSystemAction('strategy.roadmap.create', `Roadmap "${v.name}"`);
      revalidatePath('/[locale]/strategy', 'page');
      return { roadmap: row };
    }

    const roadmap = await sql.begin(async (tx) => {
      const [cur] = await tx<{ node_status: Record<string, string>; node_links: Record<string, unknown> }[]>`
        select node_status, node_links from strategy_roadmaps where id = ${v.id!} for update`;
      if (!cur) return null;
      // Re-key status and links; ids not in the map keep their key.
      const move = <T,>(obj: Record<string, T>) => {
        const out: Record<string, T> = {};
        for (const [k, val] of Object.entries(obj ?? {})) {
          const to = k in v.remap ? v.remap[k] : k;
          if (to) out[to] = val;
        }
        return out;
      };
      const [row] = await tx<StrategyRoadmap[]>`
        update strategy_roadmaps set
          name = ${v.name}, subtitle = ${v.subtitle}, icon = ${v.icon}, sections = ${sql.json(v.sections)},
          node_status = ${sql.json(move(cur.node_status))}, node_links = ${sql.json(move(cur.node_links) as never)}
        where id = ${v.id!}
        returning ${COLS}`;
      // Linked tasks follow their topic (or lose the link if it was removed).
      // Two passes through a temporary prefix so a → b, b → c can't collide.
      const moves = Object.entries(v.remap).filter(([a, b]) => a !== b);
      for (const [from] of moves) {
        await tx`update strategy_tasks set roadmap_node = ${`~${from}`} where roadmap_id = ${v.id!} and roadmap_node = ${from}`;
      }
      for (const [from, to] of moves) {
        await tx`
          update strategy_tasks set roadmap_node = ${to}, roadmap_id = ${to ? v.id! : null}
          where roadmap_id = ${v.id!} and roadmap_node = ${`~${from}`}`;
      }
      return row;
    });
    if (!roadmap) return { error: 'notFound' };
    revalidatePath('/[locale]/strategy', 'page');
    return { roadmap };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteRoadmapAction(id: string): Promise<Result> {
  const g = await requireRoadmapEditor();
  if ('error' in g) return g;
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    // strategy_tasks.roadmap_id is `on delete set null`; clear the node too.
    await sql`update strategy_tasks set roadmap_node = null where roadmap_id = ${id}`;
    const res = await sql`delete from strategy_roadmaps where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('strategy.roadmap.delete', `Deleted roadmap ${id}`);
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const nodeUpdateSchema = z.object({
  roadmapId: z.string().uuid(),
  nodeId: nodeId,
  title: z.string().trim().min(1).max(80),
});

export async function updateStrategyRoadmapNodeAction(
  input: z.input<typeof nodeUpdateSchema>,
): Promise<Result> {
  const g = await requireRoadmapEditor();
  if ('error' in g) return g;
  const p = nodeUpdateSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { roadmapId, nodeId, title } = p.data;

  // Parse the nodeId to determine if it's a stage or topic
  // Stage: just the sectionId (e.g., "q1")
  // Topic: sectionId-l/r + index (e.g., "q1-l0")
  const isTopic = /-[lr]\d+$/.test(nodeId);

  try {
    const updated = await sql.begin(async (tx) => {
      const [row] = await tx<{ sections: Array<{ id: string; t: string; left: string[]; right: string[] }> }[]>`
        select sections from strategy_roadmaps where id = ${roadmapId} for update`;
      if (!row) return null;

      const sections = row.sections;
      if (isTopic) {
        // Parse topic node: "q1-l0" or "q1-r2"
        const match = nodeId.match(/^(.+)-([lr])(\d+)$/);
        if (!match) return null;
        const [, sectionId, side, indexStr] = match;
        const index = parseInt(indexStr, 10);
        const section = sections.find((s) => s.id === sectionId);
        if (!section || index >= section[side as 'left' | 'right'].length) return null;
        section[side as 'left' | 'right'][index] = title;
      } else {
        // Stage node: just update the section title
        const section = sections.find((s) => s.id === nodeId);
        if (!section) return null;
        section.t = title;
      }

      await tx`
        update strategy_roadmaps set sections = ${sql.json(sections)}, updated_at = now()
        where id = ${roadmapId}`;
      return true;
    });

    if (!updated) return { error: 'notFound' };
    revalidatePath('/[locale]/strategy', 'page');
    return {};
  } catch {
    return { error: 'updateFailed' };
  }
}

const milestoneUpdate = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export async function updateMilestoneAction(
  input: z.input<typeof milestoneUpdate>,
): Promise<Result<{ milestone: { id: string; title: string; date: string } }>> {
  const g = await requireRoadmapEditor();
  if ('error' in g) return g;
  const p = milestoneUpdate.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ id: string; title: string; date: string }[]>`
      update strategy_milestones set title = ${p.data.title}, date = ${p.data.date}
      where id = ${p.data.id} returning id, title, date`;
    if (!row) return { error: 'notFound' };
    revalidatePath('/[locale]/strategy', 'page');
    return { milestone: row };
  } catch {
    return { error: 'updateFailed' };
  }
}
