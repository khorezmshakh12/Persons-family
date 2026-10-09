'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { requireCap } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { escapeTelegramText, sendTelegramManyAs } from '@/lib/telegram';
import { DECISION_FLOW, DECISION_KIND_LABEL, DECISION_KINDS, DECISION_STATUSES, type DecisionStatus } from '@/lib/perforce-load';

type Result = { error?: string };
const uuid = z.string().uuid();

function done() {
  revalidatePath('/[locale]/perforce', 'page');
  return {};
}

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap('perforce.edit');
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

/* -------------------------------------------------------- change requests */

/** Delete a change request (comments and votes cascade). */
export async function deleteChangeRequestAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const r = await sql`delete from pf_change_requests where id = ${id}`;
    if (r.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('pf.cr_delete', id);
  return done();
}

/** Delete one's own review comment. */
export async function deleteCrCommentAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const r = await sql`delete from pf_cr_comments where id = ${id} and author_id = ${g.id}`;
    if (r.count === 0) return { error: 'forbidden' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------ ISO 31000 risk register */

const riskSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid.nullable(),
  title: z.string().trim().min(1).max(300),
  category: z.enum(['strategic', 'operational', 'financial', 'compliance', 'people', 'technology']),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  treatment: z.enum(['avoid', 'reduce', 'transfer', 'accept']),
  mitigation: z.string().trim().max(2000),
  ownerId: uuid.nullable(),
  reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  status: z.enum(['open', 'monitoring', 'closed', 'occurred']),
  postmortem: z.string().trim().max(4000),
});

export async function saveRiskAction(input: z.input<typeof riskSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = riskSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const r = await sql`
        update pf_risks set space_id = ${v.spaceId}, title = ${v.title}, category = ${v.category},
          likelihood = ${v.likelihood}, impact = ${v.impact}, treatment = ${v.treatment}, mitigation = ${v.mitigation},
          owner_id = ${v.ownerId}, review_date = ${v.reviewDate}, status = ${v.status}, postmortem = ${v.postmortem},
          updated_at = now()
        where id = ${v.id}`;
      if (r.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into pf_risks (space_id, title, category, likelihood, impact, treatment, mitigation, owner_id, review_date, status, postmortem, created_by)
        values (${v.spaceId}, ${v.title}, ${v.category}, ${v.likelihood}, ${v.impact}, ${v.treatment}, ${v.mitigation},
          ${v.ownerId}, ${v.reviewDate}, ${v.status}, ${v.postmortem}, ${g.id})`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteRiskAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`delete from pf_risks where id = ${id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}


/* ================================================================ Perforce v2 */

/** CEO / COO (held position) — decides on decisions, sets owners and weights. */
async function requireLead(): Promise<{ id: string } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  const held = profile.roles ?? [profile.role];
  if (!held.some((r) => r === 'ceo' || r === 'coo')) return { error: 'forbidden' };
  return { id: user.id };
}

async function notify(userIds: string[], text: string) {
  if (!userIds.length) return;
  const rows = await sql<{ telegram_id: number | null }[]>`
    select telegram_id from profiles where id = any(${sql.array(userIds)}::uuid[]) and is_active and telegram_id is not null`;
  await sendTelegramManyAs('task', rows.map((r) => r.telegram_id), text).catch(() => {});
}

async function leaders(): Promise<string[]> {
  const rows = await sql<{ id: string }[]>`
    select distinct p.id from profiles p left join profile_roles r on r.user_id = p.id
    where p.is_active and (p.role in ('ceo', 'coo') or r.role::text in ('ceo', 'coo'))`;
  return rows.map((r) => r.id);
}

/* ------------------------------------------------------------ owner */

export async function setSpaceOwnerAction(spaceId: string, ownerId: string | null): Promise<Result> {
  const g = await requireLead();
  if ('error' in g) return g;
  if (!uuid.safeParse(spaceId).success || (ownerId && !uuid.safeParse(ownerId).success)) return { error: 'invalidInput' };
  try {
    const res = await sql`update strategy_spaces set owner_id = ${ownerId} where id = ${spaceId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('perforce.owner', `${spaceId} → ${ownerId ?? 'none'}`);
  return done();
}

/* ------------------------------------------------------------ weekly status */

const statusSchema = z
  .object({
    spaceId: uuid,
    rag: z.enum(['green', 'amber', 'red']),
    suggested: z.enum(['green', 'amber', 'red']),
    overrideNote: z.string().trim().max(500).default(''),
    summary: z.string().trim().min(1).max(2000),
    nextSteps: z.string().trim().max(2000).default(''),
  })
  .refine((v) => v.rag === v.suggested || v.overrideNote.length >= 3, 'override');

/** The project owner (or leadership; or anyone when no owner is set). */
async function canWriteStatus(spaceId: string, userId: string): Promise<boolean> {
  const [s] = await sql<{ owner_id: string | null }[]>`select owner_id from strategy_spaces where id = ${spaceId}`;
  if (!s) return false;
  if (!s.owner_id || s.owner_id === userId) return true;
  return !('error' in (await requireLead()));
}

/** A project's weekly status (colour + what happened + blockers / next). */
export async function saveStatusUpdateAction(input: z.input<typeof statusSchema>): Promise<Result & { id?: string }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = statusSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues.some((i) => i.message === 'override') ? 'overrideNote' : 'invalidInput' };
  if (!(await canWriteStatus(p.data.spaceId, g.id))) return { error: 'notOwner' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into pf_status_updates (space_id, rag, suggested, override_note, summary, next_steps, author_id)
      values (${p.data.spaceId}, ${p.data.rag}, ${p.data.suggested}, ${p.data.overrideNote || null}, ${p.data.summary}, ${p.data.nextSteps}, ${g.id})
      returning id`;
    logSystemAction('perforce.status', `Status ${p.data.rag} for ${p.data.spaceId}`);
    done();
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

const statusEditSchema = z.object({
  id: uuid,
  summary: z.string().trim().min(1).max(2000),
  nextSteps: z.string().trim().max(2000).default(''),
});

/** The author may fix a status for 24 hours; after that it is history. */
export async function updateStatusUpdateAction(input: z.input<typeof statusEditSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = statusEditSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const res = await sql`
      update pf_status_updates set summary = ${p.data.summary}, next_steps = ${p.data.nextSteps}, updated_at = now()
      where id = ${p.data.id} and author_id = ${g.id} and created_at > now() - interval '24 hours'`;
    if (res.count === 0) return { error: 'locked' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteStatusUpdateAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from pf_status_updates where id = ${id} and author_id = ${g.id} and created_at > now() - interval '24 hours'`;
    if (res.count === 0) return { error: 'locked' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------ workload weights */

const weightsSchema = z.object({
  stask: z.number().min(0).max(5),
  task: z.number().min(0).max(5),
  issue: z.number().min(0).max(5),
  capacity: z.number().min(1).max(7),
});

export async function saveLoadWeightsAction(input: z.input<typeof weightsSchema>): Promise<Result> {
  const g = await requireLead();
  if ('error' in g) return g;
  const p = weightsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into pf_settings (key, value, updated_by) values ('load_weights', ${sql.json(p.data)}, ${g.id})
      on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------ decisions */

const decisionSchema = z.object({
  id: uuid.optional(),
  kind: z.enum(DECISION_KINDS),
  title: z.string().trim().min(1).max(300),
  currentValue: z.string().trim().max(500).default(''),
  proposedValue: z.string().trim().max(500).default(''),
  description: z.string().trim().max(5000).default(''),
  impact: z.string().trim().max(2000).default(''),
  spaceId: uuid.nullable().default(null),
  staskId: uuid.nullable().default(null),
  submit: z.boolean().default(true),
});

/** Create or edit a decision request; `submit` sends it for a decision. */
export async function saveDecisionAction(input: z.input<typeof decisionSchema>): Promise<Result & { id?: string }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = decisionSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  const status = v.submit ? 'review' : 'draft';
  try {
    const [row] = v.id
      ? await sql<{ id: string }[]>`
          update pf_change_requests set kind = ${v.kind}, title = ${v.title}, current_value = ${v.currentValue},
            proposed_value = ${v.proposedValue}, description = ${v.description}, impact = ${v.impact},
            space_id = ${v.spaceId}, stask_id = ${v.staskId}, status = ${status}
          where id = ${v.id} and author_id = ${g.id} and status in ('draft', 'review') returning id`
      : await sql<{ id: string }[]>`
          insert into pf_change_requests (kind, title, current_value, proposed_value, description, impact, space_id, stask_id, status, author_id)
          values (${v.kind}, ${v.title}, ${v.currentValue}, ${v.proposedValue}, ${v.description}, ${v.impact}, ${v.spaceId}, ${v.staskId}, ${status}, ${g.id})
          returning id`;
    if (!row) return { error: 'locked' };
    if (v.submit) {
      const by = g.id;
      after(async () => {
        const to = (await leaders()).filter((id) => id !== by);
        await notify(to, `🧭 <b>Qaror so‘raladi</b> (${escapeTelegramText(DECISION_KIND_LABEL[v.kind])}): ${escapeTelegramText(v.title)}\nPerforce › Qarorlar`);
      });
    }
    done();
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

const moveSchema = z.object({ id: uuid, to: z.enum(DECISION_STATUSES), note: z.string().trim().max(1000).default('') });

/** Decide (leadership), take back to draft (author) or reopen (leadership). */
export async function moveDecisionAction(input: z.input<typeof moveSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = moveSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, to, note } = p.data;
  if (to === 'rejected' && note.length < 3) return { error: 'reasonRequired' };
  const [cr] = await sql<{ status: DecisionStatus; author_id: string | null; title: string }[]>`
    select status, author_id, title from pf_change_requests where id = ${id}`;
  if (!cr) return { error: 'notFound' };
  if (!DECISION_FLOW[cr.status].includes(to)) return { error: 'conflict' };
  const deciding = to === 'approved' || to === 'rejected' || cr.status === 'approved' || cr.status === 'rejected';
  if (deciding && 'error' in (await requireLead())) return { error: 'leadOnly' };
  if (to === 'draft' && cr.author_id !== g.id) return { error: 'forbidden' };
  try {
    const res = await sql`
      update pf_change_requests set status = ${to},
        decided_by = case when ${to} in ('approved', 'rejected') then ${g.id}::uuid else null end,
        decided_at = case when ${to} in ('approved', 'rejected') then now() else null end,
        decision_note = case when ${to} in ('approved', 'rejected') then ${note || null} else decision_note end
      where id = ${id} and status = ${cr.status}`;
    if (res.count === 0) return { error: 'conflict' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('pf.decision', `${id}: ${cr.status} → ${to}`);
  if ((to === 'approved' || to === 'rejected') && cr.author_id && cr.author_id !== g.id) {
    const author = cr.author_id;
    after(() =>
      notify(
        [author],
        `${to === 'approved' ? '✅ <b>Qaror tasdiqlandi</b>' : '❌ <b>Qaror rad etildi</b>'}: ${escapeTelegramText(cr.title)}${note ? `\n${escapeTelegramText(note)}` : ''}`,
      ),
    );
  }
  return done();
}

/** "Qo‘llab-quvvatlayman" — toggle. */
export async function toggleDecisionSupportAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from pf_cr_votes where cr_id = ${id} and voter_id = ${g.id}`;
    if (res.count === 0) await sql`insert into pf_cr_votes (cr_id, voter_id) values (${id}, ${g.id}) on conflict do nothing`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const commentSchema = z.object({ id: uuid, body: z.string().trim().min(1).max(2000) });

export async function commentChangeRequestAction(input: z.input<typeof commentSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = commentSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`insert into pf_cr_comments (cr_id, author_id, body) values (${p.data.id}, ${g.id}, ${p.data.body})`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/** An approved deadline decision: move the project's end date to the
 * proposed one (YYYY-MM-DD), once. */
export async function applyDeadlineDecisionAction(id: string): Promise<Result> {
  const g = await requireLead();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  const [cr] = await sql<{ kind: string; status: string; space_id: string | null; proposed_value: string; applied_at: string | null }[]>`
    select kind, status, space_id, proposed_value, applied_at from pf_change_requests where id = ${id}`;
  if (!cr || cr.kind !== 'deadline' || cr.status !== 'approved' || !cr.space_id) return { error: 'notApplicable' };
  if (cr.applied_at) return { error: 'alreadyApplied' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cr.proposed_value)) return { error: 'badDate' };
  try {
    await sql.begin(async (tx) => {
      await tx`update strategy_spaces set end_date = ${cr.proposed_value} where id = ${cr.space_id}`;
      await tx`update pf_change_requests set applied_at = now() where id = ${id}`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy', 'page');
  return done();
}
