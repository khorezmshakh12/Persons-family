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
  EMPTY_MIND,
  EMPTY_ROADMAP,
  GROWTH_MAX_DEPTH,
  GROWTH_MAX_NODES,
  canon,
  countNodes,
  findStageOf,
  stageComplete,
  stageNodeIds,
  stageCanon,
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
// roadmap / mind = qoralama (istalgancha tahrir); sent_* = «CEO'ga yuborish»
// nusxasi — CEO tasdig'i va HR ko'rinishi faqat shunga tayanadi.

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
  mind: GrowthMind;
  node_status: Record<string, NodeStatus>;
  stage_state: Record<string, StageReview>;
  sent_roadmap: GrowthRoadmap;
  sent_mind: GrowthMind;
  sent_at: string | Date | null;
};

type Tx = TransactionSql;

/** Locks (creating if needed) the person's row inside a transaction. */
async function lockRow(t: Tx, userId: string): Promise<GrowthRow> {
  await t`insert into hr_growth (user_id) values (${userId}) on conflict (user_id) do nothing`;
  const [row] = await t<GrowthRow[]>`
    select roadmap, mind, node_status, stage_state, sent_roadmap, sent_mind, sent_at
    from hr_growth where user_id = ${userId} for update`;
  return {
    roadmap: row.roadmap?.sections ? row.roadmap : EMPTY_ROADMAP,
    mind: row.mind?.ch ? row.mind : EMPTY_MIND,
    node_status: row.node_status ?? {},
    stage_state: row.stage_state ?? {},
    sent_roadmap: row.sent_roadmap?.sections ? row.sent_roadmap : EMPTY_ROADMAP,
    sent_mind: row.sent_mind?.ch ? row.sent_mind : EMPTY_MIND,
    sent_at: row.sent_at,
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
const allIds = (r: GrowthRoadmap) => r.sections.flatMap((s) => [s.id, ...stageNodeIds(s)]);

/** «Saqlash» — the employee's own draft. Anything may be added, edited or
 * deleted at any time; the CEO / HR keep seeing the last sent copy (and its
 * approvals) until «CEO'ga yuborish». */
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
    await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      // Status / review records only for nodes that exist in the draft or in
      // the sent copy (the CEO still sees the sent one).
      const keep = new Set([...all, ...allIds(cur.sent_roadmap)]);
      const status = Object.fromEntries(Object.entries(cur.node_status).filter(([k]) => keep.has(k)));
      const state = Object.fromEntries(Object.entries(cur.stage_state).filter(([k]) => keep.has(k)));
      await t`update hr_growth set roadmap = ${t.json(next as never)}, node_status = ${t.json(status as never)},
        stage_state = ${t.json(state as never)}, updated_at = now() where user_id = ${user.id}`;
    });
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

/** «CEO'ga yuborish» — the draft becomes what the CEO / HR see. Can be sent
 * again any time; an approved stage that changed goes back for approval. */
export async function sendGrowthAction(): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  let first = false;
  let reapprove = 0;
  try {
    const err = await sql.begin(async (s) => {
      const t = s;
      const cur = await lockRow(t, user.id);
      if (!cur.roadmap.sections.length && !cur.mind.ch.length && !cur.sent_at) return 'empty';
      if (canon(cur.roadmap) === canon(cur.sent_roadmap) && canon(cur.mind) === canon(cur.sent_mind)) return 'nothingNew';
      first = !cur.sent_at;
      const sentStages = new Map(cur.sent_roadmap.sections.map((x) => [x.id, x]));
      const keep = new Set(allIds(cur.roadmap));
      const state: Record<string, StageReview> = Object.fromEntries(Object.entries(cur.stage_state).filter(([k]) => keep.has(k)));
      const at = new Date().toISOString();
      for (const st of cur.roadmap.sections) {
        const prev = sentStages.get(st.id);
        if (prev && state[st.id]?.s === 'approved' && stageCanon(prev) !== stageCanon(st)) {
          state[st.id] = { s: 'self_done', at };
          reapprove++;
        }
      }
      const status = Object.fromEntries(Object.entries(cur.node_status).filter(([k]) => keep.has(k)));
      await t`update hr_growth set sent_roadmap = roadmap, sent_mind = mind, sent_at = now(),
        submitted_at = coalesce(submitted_at, now()), stage_state = ${t.json(state as never)},
        node_status = ${t.json(status as never)}, updated_at = now() where user_id = ${user.id}`;
      return null;
    });
    if (err) return { error: err };
    const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
    const text = first
      ? `🗺 ${name} roadmap’ini CEO’ga yubordi`
      : `🗺 ${name} roadmap’ini yangiladi${reapprove ? ` — ${reapprove} ta o‘zgargan bosqich qayta tasdiq kutmoqda` : ''}`;
    await notifyUsers('goals', await ceoRecipients(), text, { href: `/hr?tab=growth&person=${user.id}` }).catch(() => {});
    revalidate();
    return { ok: true };
  } catch (e) {
    console.error('[hr-growth] send failed', e);
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
      // The CEO approves the sent copy — the stage must be sent as it is now.
      const stage = cur.sent_roadmap.sections.find((x) => x.id === stageId);
      const draft = cur.roadmap.sections.find((x) => x.id === stageId);
      if (!stage || !draft) return 'notFound';
      const phase = stagePhases(cur.sent_roadmap, cur.stage_state)[stageId];
      if (done) {
        if (!cur.sent_at || stageCanon(stage) !== stageCanon(draft)) return 'notSubmitted';
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
      if (!cur.sent_at) return 'notSubmitted';
      const stage = cur.sent_roadmap.sections.find((x) => x.id === stageId);
      if (!stage) return 'notFound';
      // Someone else may have decided already — only a waiting stage moves.
      if (stagePhases(cur.sent_roadmap, cur.stage_state)[stageId] !== 'waiting') return 'alreadyDecided';
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

/** Saves the employee's own mind map draft (CEO / HR see the sent copy). */
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
