'use server';

import { z } from 'zod';
import type { TransactionSql } from 'postgres';
import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canFor } from '@/lib/permissions';
import { notifyUsers } from '@/lib/telegram';
import type { NodeStatus } from '@/lib/strategy';
import {
  EMPTY_ROADMAP,
  GROWTH_MAX_DEPTH,
  GROWTH_MAX_NODES,
  countNodes,
  findStageOf,
  stageComplete,
  stageNodeIds,
  stagePhases,
  walkNodes,
  type GrowthMind,
  type GrowthNode,
  type GrowthRoadmap,
  type MindNode,
  type StageReview,
} from '@/lib/hr-growth';

// HR › Roadmap va Mind map. Har bir amal o'z autentifikatsiyasini tekshiradi.
// Xodim faqat o'z yozuviga tegadi; bosqich tasdig'i faqat CEO'da
// (growth.review). Holat o'tishlari qator qulfi (for update) ostida.

type Result = { error: string } | { ok: true };

const id = z.string().regex(/^[a-z0-9]{1,24}$/);
const title = z.string().trim().min(1).max(120);

const nodeSchema: z.ZodType<GrowthNode> = z.lazy(() => z.object({ id, t: title, ch: z.array(nodeSchema).max(300) }));
const mindSchema: z.ZodType<MindNode> = z.lazy(() =>
  z.object({ id, t: title, c: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), ch: z.array(mindSchema).max(300) }),
);

const roadmapSchema = z.object({
  name: z.string().trim().max(80).default(''),
  subtitle: z.string().trim().max(80).default(''),
  sections: z
    .array(z.object({ id, t: title, q: z.string().trim().max(30).default(''), left: z.array(nodeSchema).max(300), right: z.array(nodeSchema).max(300) }))
    .max(60),
});

const STATUSES = ['todo', 'progress', 'done', 'skip'] as const;

function depthOf<T extends { ch: T[] }>(list: T[]): number {
  let d = 0;
  walkNodes(list, (_, depth) => (d = Math.max(d, depth)));
  return d;
}

function uniqueIds(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

type GrowthRow = {
  roadmap: GrowthRoadmap;
  node_status: Record<string, NodeStatus>;
  stage_state: Record<string, StageReview>;
  submitted_at: Date | null;
};

type Tx = TransactionSql;

/** Locks (creating if needed) the person's row inside a transaction. */
async function lockRow(t: Tx, userId: string): Promise<GrowthRow> {
  await t`insert into hr_growth (user_id) values (${userId}) on conflict (user_id) do nothing`;
  const [row] = await t<GrowthRow[]>`
    select roadmap, node_status, stage_state, submitted_at from hr_growth where user_id = ${userId} for update`;
  return {
    roadmap: row.roadmap?.sections ? row.roadmap : EMPTY_ROADMAP,
    node_status: row.node_status ?? {},
    stage_state: row.stage_state ?? {},
    submitted_at: row.submitted_at,
  };
}

async function ceoRecipients(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select p.id from profiles p
    where p.is_active and (p.role = 'ceo' or exists (select 1 from profile_roles r where r.user_id = p.id and r.role = 'ceo'))
  `.catch(() => []);
  return rows.map((r) => r.id);
}

const revalidate = () => revalidatePath('/[locale]/hr', 'page');
const stageJson = (s: GrowthRoadmap['sections'][number]) => JSON.stringify([s.id, s.t, s.q, s.left, s.right]);

/** Saves the employee's own roadmap structure. Approved / waiting stages are
 * frozen: they must stay first, in order, unchanged. */
export async function saveGrowthRoadmapAction(input: GrowthRoadmap): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const parsed = roadmapSchema.safeParse(input);
  if (!parsed.success) return { error: 'invalidInput' };
  const next = parsed.data as GrowthRoadmap;
  const all = next.sections.flatMap((s) => [s.id, ...stageNodeIds(s)]);
  if (!uniqueIds(all)) return { error: 'invalidInput' };
  if (all.length > GROWTH_MAX_NODES) return { error: 'tooBig' };
  if (next.sections.some((s) => depthOf([...s.left, ...s.right]) > GROWTH_MAX_DEPTH)) return { error: 'tooDeep' };
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      const phases = stagePhases(cur.roadmap, cur.stage_state);
      const frozen = cur.roadmap.sections.filter((x) => phases[x.id] === 'approved' || phases[x.id] === 'waiting');
      for (let i = 0; i < frozen.length; i++) {
        const n = next.sections[i];
        if (!n || stageJson(n) !== stageJson(frozen[i])) return 'frozen';
      }
      // Status and review records only for nodes / stages that still exist.
      const keep = new Set(all);
      const status = Object.fromEntries(Object.entries(cur.node_status).filter(([k]) => keep.has(k)));
      const state = Object.fromEntries(Object.entries(cur.stage_state).filter(([k]) => keep.has(k)));
      await t`update hr_growth set roadmap = ${t.json(next as never)}, node_status = ${t.json(status as never)},
        stage_state = ${t.json(state as never)}, updated_at = now() where user_id = ${user.id}`;
      return null;
    });
    if (err) return { error: err };
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] save roadmap failed', e);
    return { error: 'failed' };
  }
}

/** Status of a topic / sub-item — only inside the current (open) stage. */
export async function setGrowthNodeStatusAction(nodeId: string, status: NodeStatus): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id.safeParse(nodeId).success || !(STATUSES as readonly string[]).includes(status)) return { error: 'invalidInput' };
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      const stage = findStageOf(cur.roadmap, nodeId);
      if (!stage || stage.id === nodeId) return 'notFound';
      if (stagePhases(cur.roadmap, cur.stage_state)[stage.id] !== 'current') return 'locked';
      await t`update hr_growth set node_status = node_status || ${t.json({ [nodeId]: status } as never)}, updated_at = now()
        where user_id = ${user.id}`;
      return null;
    });
    if (err) return { error: err };
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] node status failed', e);
    return { error: 'failed' };
  }
}

/** «CEO'ga topshirish» — from now on the CEO sees the roadmap. */
export async function submitGrowthAction(): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      if (!cur.roadmap.sections.length) return 'empty';
      if (cur.submitted_at) return 'already';
      await t`update hr_growth set submitted_at = now(), updated_at = now() where user_id = ${user.id}`;
      return null;
    });
    if (err) return { error: err };
    const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    await notifyUsers('goals', await ceoRecipients(), `🗺 ${name} roadmap’ini topshirdi`, { href: '/hr?tab=growth' }).catch(() => {});
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] submit failed', e);
    return { error: 'failed' };
  }
}

/** Employee: «Bosqichni yakunladim» (or take it back while still waiting). */
export async function markGrowthStageAction(stageId: string, done: boolean): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!id.safeParse(stageId).success) return { error: 'invalidInput' };
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      const stage = cur.roadmap.sections.find((x) => x.id === stageId);
      if (!stage) return 'notFound';
      const phase = stagePhases(cur.roadmap, cur.stage_state)[stageId];
      if (done) {
        if (!cur.submitted_at) return 'notSubmitted';
        if (phase !== 'current') return 'locked';
        if (!stageComplete(stage, cur.node_status)) return 'incomplete';
        const rec: StageReview = { s: 'self_done', at: new Date().toISOString() };
        await t`update hr_growth set stage_state = stage_state || ${t.json({ [stageId]: rec } as never)}, updated_at = now()
          where user_id = ${user.id}`;
      } else {
        if (phase !== 'waiting') return 'locked';
        await t`update hr_growth set stage_state = stage_state - ${stageId}, updated_at = now() where user_id = ${user.id}`;
      }
      return null;
    });
    if (err) return { error: err };
    if (done) {
      const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
      await notifyUsers('goals', await ceoRecipients(), `✅ ${name} roadmap bosqichini yakunladi — tasdiqlash kutilmoqda`, {
        href: `/hr?tab=growth&person=${user.id}`,
      }).catch(() => {});
    }
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] mark stage failed', e);
    return { error: 'failed' };
  }
}

/** CEO: approve a waiting stage (opens the next one) or return it with a note. */
export async function reviewGrowthStageAction(input: { userId: string; stageId: string; approve: boolean; note?: string }): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  if (!canFor(profile, 'growth.review')) return { error: 'forbidden' };
  const p = z
    .object({ userId: z.string().uuid(), stageId: id, approve: z.boolean(), note: z.string().trim().max(500).optional() })
    .safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { userId, stageId, approve, note } = p.data;
  if (!approve && !note) return { error: 'noteRequired' };
  let stageName = '';
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, userId);
      if (!cur.submitted_at) return 'notSubmitted';
      const stage = cur.roadmap.sections.find((x) => x.id === stageId);
      if (!stage) return 'notFound';
      // Someone else may have decided already — only a waiting stage moves.
      if (stagePhases(cur.roadmap, cur.stage_state)[stageId] !== 'waiting') return 'alreadyDecided';
      stageName = stage.t;
      const at = new Date().toISOString();
      const rec: StageReview = approve ? { s: 'approved', at, by: user.id, ...(note ? { note } : {}) } : { s: 'returned', at, by: user.id, note: note! };
      await t`update hr_growth set stage_state = stage_state || ${t.json({ [stageId]: rec } as never)}, updated_at = now()
        where user_id = ${userId}`;
      return null;
    });
    if (err) return { error: err };
    await notifyUsers(
      'goals',
      [userId],
      approve ? `🎉 «${stageName}» bosqichi CEO tomonidan tasdiqlandi — keyingi bosqich ochildi` : `↩️ «${stageName}» bosqichi qaytarildi: ${note}`,
      { href: '/hr?tab=growth' },
    ).catch(() => {});
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] review failed', e);
    return { error: 'failed' };
  }
}

/** Saves the employee's own mind map (always visible to the CEO). */
export async function saveGrowthMindAction(input: GrowthMind): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const p = z.object({ t: z.string().trim().max(80).default(''), ch: z.array(mindSchema).max(300) }).safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const mind = p.data as GrowthMind;
  const ids: string[] = [];
  walkNodes(mind.ch, (n) => ids.push(n.id));
  if (!uniqueIds(ids)) return { error: 'invalidInput' };
  if (countNodes(mind.ch) > GROWTH_MAX_NODES) return { error: 'tooBig' };
  if (depthOf(mind.ch) > GROWTH_MAX_DEPTH) return { error: 'tooDeep' };
  try {
    await sql`
      insert into hr_growth (user_id, mind) values (${user.id}, ${sql.json(mind as never)})
      on conflict (user_id) do update set mind = excluded.mind, updated_at = now()`;
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] save mind failed', e);
    return { error: 'failed' };
  }
}
