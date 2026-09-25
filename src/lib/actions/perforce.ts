'use server';

import { z } from 'zod';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { requireStrategyEditor } from '@/lib/strategy-auth';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { triageIssue } from '@/lib/ai-triage';
import { bumpBoardSignal } from '@/lib/gcp/firestoreAdmin';

type Result = { error?: string };
const uuid = z.string().uuid();

function done() {
  revalidatePath('/[locale]/perforce', 'page');
  return {};
}

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireStrategyEditor();
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

/* ------------------------------------------------------------ sprint goal */

const goalSchema = z.object({ sprintNo: z.number().int().min(1).max(10_000), goal: z.string().trim().max(300) });

export async function saveSprintGoalAction(input: z.input<typeof goalSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = goalSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    if (!p.data.goal) await sql`delete from pf_sprint_goals where sprint_no = ${p.data.sprintNo}`;
    else
      await sql`
        insert into pf_sprint_goals (sprint_no, goal, updated_by) values (${p.data.sprintNo}, ${p.data.goal}, ${g.id})
        on conflict (sprint_no) do update set goal = excluded.goal, updated_by = excluded.updated_by, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/* ------------------------------------------------------------- test cases */

const testSchema = z.object({
  id: uuid.optional(),
  spaceId: uuid,
  staskId: uuid.nullable(),
  title: z.string().trim().min(1).max(300),
});

export async function saveTestCaseAction(input: z.input<typeof testSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = testSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { id, spaceId, staskId, title } = p.data;
  try {
    if (staskId) {
      const [t] = await sql<{ space_id: string }[]>`select space_id from strategy_tasks where id = ${staskId}`;
      if (!t || t.space_id !== spaceId) return { error: 'invalidInput' };
    }
    if (id) {
      const r = await sql`update pf_test_cases set space_id = ${spaceId}, stask_id = ${staskId}, title = ${title} where id = ${id}`;
      if (r.count === 0) return { error: 'notFound' };
    } else {
      await sql`insert into pf_test_cases (space_id, stask_id, title, created_by) values (${spaceId}, ${staskId}, ${title}, ${g.id})`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteTestCaseAction(id: string): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`delete from pf_test_cases where id = ${id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const runSchema = z.object({ id: uuid, result: z.enum(['pass', 'fail', 'blocked', 'none']) });

/** Records a test run. A failure with no open linked issue opens one in
 * Muammolar (assigned to the requirement's owner) and links it. */
export async function runTestCaseAction(input: z.input<typeof runSchema>): Promise<Result & { issueId?: string }> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = runSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  let created: string | undefined;
  try {
    created = await sql.begin(async (tx) => {
      const [tc] = await tx<{ title: string; issue_id: string | null; open: boolean | null; assignee: string | null; req: string | null }[]>`
        select c.title, c.issue_id, (i.status <> 'done') as open, t.assignee_id as assignee, t.title as req
        from pf_test_cases c
        left join issues i on i.id = c.issue_id
        left join strategy_tasks t on t.id = c.stask_id
        where c.id = ${p.data.id}
        for update of c`;
      if (!tc) throw new Error('notFound');
      await tx`update pf_test_cases set result = ${p.data.result}, run_at = now() where id = ${p.data.id}`;
      if (p.data.result !== 'fail' || (tc.issue_id && tc.open)) return undefined;
      const desc = `ALM test yiqildi: «${tc.title}»${tc.req ? `\nTalab: ${tc.req}` : ''}`;
      const [row] = await tx<{ id: string }[]>`
        insert into issues (created_by, title, description, assigned_to)
        values (${g.id}, ${`${tc.title} — test yiqildi`.slice(0, 200)}, ${desc}, ${tc.assignee})
        returning id`;
      await tx`update pf_test_cases set issue_id = ${row.id} where id = ${p.data.id}`;
      return row.id;
    });
  } catch (e) {
    return { error: e instanceof Error && e.message === 'notFound' ? 'notFound' : 'updateFailed' };
  }
  if (created) {
    const id = created;
    logSystemAction('pf.test_failed_issue', `Test ${p.data.id} → issue ${id}`);
    after(async () => {
      try {
        await triageIssue(id);
        await bumpBoardSignal('issues');
      } catch {}
    });
    revalidatePath('/[locale]/issues', 'page');
  }
  done();
  return { issueId: created };
}

/* -------------------------------------------------------- change requests */

const crSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(5000).default(''),
  spaceId: uuid.nullable(),
  staskId: uuid.nullable(),
});

export async function createChangeRequestAction(input: z.input<typeof crSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = crSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into pf_change_requests (title, description, space_id, stask_id, author_id)
      values (${p.data.title}, ${p.data.description}, ${p.data.spaceId}, ${p.data.staskId}, ${g.id})`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const decideSchema = z.object({ id: uuid, to: z.enum(['review', 'approved', 'rejected', 'submitted']) });
/** Allowed transitions — `submitted` (merged/applied) only after approval. */
const FROM: Record<z.infer<typeof decideSchema>['to'], string[]> = {
  review: ['needs', 'rejected'],
  approved: ['needs', 'review'],
  rejected: ['needs', 'review'],
  submitted: ['approved'],
};

export async function decideChangeRequestAction(input: z.input<typeof decideSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = decideSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const ok = await sql.begin(async (tx) => {
      const r = await tx`
        update pf_change_requests set status = ${p.data.to}, decided_by = ${g.id}, decided_at = now()
        where id = ${p.data.id} and status in ${tx(FROM[p.data.to])}`;
      if (r.count === 0) return false;
      if (p.data.to === 'approved') await tx`insert into pf_cr_votes (cr_id, voter_id) values (${p.data.id}, ${g.id}) on conflict do nothing`;
      return true;
    });
    if (!ok) return { error: 'conflict' };
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('pf.cr_decide', `${p.data.id} → ${p.data.to}`);
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
