'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { authErrorCode, requireCap } from '@/lib/auth/require-admin';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { firstOfCurrentMonth } from '@/lib/self-development';
import { insertStarTransaction } from '@/lib/stars-write';
import { bumpNavBadgeSignal } from '@/lib/gcp/firestoreAdmin';
import { suggestSelfDevRubric } from '@/lib/self-dev-ai';
import { RUBRIC_KEYS, SELF_DEV_KINDS } from '@/lib/self-dev-rubric';

export type SelfDevActionState = { error?: string; success?: boolean } | undefined;

const submitSchema = z.object({
  achievements: z.string().trim().max(4000).optional().or(z.literal('')),
  valueAdded: z.string().trim().max(4000).optional().or(z.literal('')),
  kind: z.enum(SELF_DEV_KINDS).optional().or(z.literal('')),
  hours: z.coerce.number().min(0).max(744).optional().or(z.literal('')),
  evidenceUrl: z.string().trim().url().max(500).optional().or(z.literal('')),
});

const goalSchema = z.object({ goal: z.string().trim().min(3).max(1000) });

/** This month's goal (set at the start, edited any time before the report). */
export async function saveSelfDevGoalAction(_prev: SelfDevActionState, formData: FormData): Promise<SelfDevActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into self_dev_goals (user_id, month, goal) values (${user.id}, ${firstOfCurrentMonth()}, ${parsed.data.goal})
      on conflict (user_id, month) do update set goal = excluded.goal, updated_at = now()`;
  } catch {
    return { error: 'submitFailed' };
  }
  revalidatePath('/[locale]/self-development', 'page');
  return { success: true };
}

/** Always submits for the current calendar month — never a client-supplied
 * one — so the (user_id, month) unique constraint means "once per month,
 * for real." */
export async function submitSelfDevelopmentAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };
  if (!parsed.data.achievements && !parsed.data.valueAdded) return { error: 'invalidInput' };

  const d = parsed.data;
  let id: string;
  try {
    [{ id }] = await sql<{ id: string }[]>`
      insert into self_development (user_id, month, achievements, value_added, kind, hours, evidence_url)
      values (${user.id}, ${firstOfCurrentMonth()}, ${d.achievements || null}, ${d.valueAdded || null},
        ${d.kind || null}, ${d.hours === '' || d.hours === undefined ? null : d.hours}, ${d.evidenceUrl || null})
      returning id
    `;
  } catch (error) {
    // 23505 = unique_violation — the (user_id, month) constraint, meaning
    // this month's entry already exists.
    if ((error as { code?: string }).code === '23505') return { error: 'alreadySubmitted' };
    return { error: 'submitFailed' };
  }

  // Jev's rubric suggestion for the CEO — never blocks the submit.
  after(() => suggestSelfDevRubric(id));
  revalidatePath('/[locale]/self-development', 'page');
  return { success: true };
}

// The CEO Evaluation Panel saves the rating, score, and (for a teacher's
// submission) a level change all in one action — one "Save evaluation"
// button, not three separate silent auto-saves. `level` is omitted from
// the form entirely for a non-teacher submission (the Select isn't
// rendered), so it arrives here as undefined and the profiles update is
// skipped rather than attempted with a bogus value.
const saveEvaluationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  ceoRating: z.string().trim().max(2000).optional().or(z.literal('')),
  // No upper bound — the CEO awards as many points as they see fit (spec:
  // "100/100 emas, cheksiz bal"). Still an integer and never negative.
  ceoScore: z.coerce.number().int().min(0),
  level: z.enum(TEACHER_LEVELS as [string, ...string[]]).optional(),
  bonusAmount: z.coerce.number().min(0).optional(),
  // Stars the CEO grants for this month's self-development (spec #3a).
  // Separate currency from the score. Treated as the *target* total for
  // this submission — re-saving with a different number tops up or claws
  // back the difference, so it can't double-award.
  starAward: z.coerce.number().int().min(0).optional(),
  // Rubric (advisory, next to the unbounded score): each 1..5 or absent.
  depth: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  applied: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
  evidence: z.coerce.number().int().min(1).max(5).optional().or(z.literal('')),
});

export async function saveEvaluationAction(
  _prevState: SelfDevActionState,
  formData: FormData,
): Promise<SelfDevActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCap('selfDev.review'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = saveEvaluationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  try {
    // Bind to userId too — the id alone is trusted client input, and the
    // level update + finance revalidation below key off userId, so a
    // mismatched (id, userId) pair must not write to a third person's row.
    const rubric = Object.fromEntries(
      RUBRIC_KEYS.flatMap((k) => (typeof parsed.data[k] === 'number' ? [[k, parsed.data[k]]] : [])),
    );
    const res = await sql`
      update self_development set
        ceo_rating = ${parsed.data.ceoRating || null},
        ceo_score = ${parsed.data.ceoScore},
        bonus_amount = ${parsed.data.bonusAmount ?? null},
        rubric = ${Object.keys(rubric).length ? sql.json(rubric) : null}
      where id = ${parsed.data.id} and user_id = ${parsed.data.userId}
    `;
    if (res.count === 0) return { error: 'submitFailed' };
  } catch (error) {
    // The month's pay run is approved: its bonus can no longer change.
    if (error instanceof Error && /period_locked/.test(error.message)) return { error: 'periodLocked' };
    return { error: 'submitFailed' };
  }

  if (parsed.data.level) {
    try {
      await sql`
        update profiles set teacher_level = ${parsed.data.level as TeacherLevel}, level_updated_at = now()
        where id = ${parsed.data.userId}
      `;
    } catch {
      return { error: 'submitFailed' };
    }
  }

  // Reconcile the star award for this submission to the requested total.
  // The score update already committed, so a stars failure here is logged,
  // not surfaced as an error.
  if (parsed.data.starAward !== undefined) {
    const starAward = parsed.data.starAward;
    try {
      // Read-then-write inside one transaction, with the submission row
      // locked: two overlapping saves (double-click, two tabs) used to both
      // read the same previous total and both insert the difference —
      // awarding the stars twice.
      const changed = await sql.begin(async (tx) => {
        await tx`select id from self_development where id = ${parsed.data.id} for update`;
        const [prev] = await tx<{ total: number }[]>`
          select coalesce(sum(delta), 0)::int as total from star_transactions
          where source_type = 'self_development' and source_id = ${parsed.data.id}
        `;
        const diff = starAward - (prev?.total ?? 0);
        if (diff === 0) return false;
        await insertStarTransaction(tx, {
          userId: parsed.data.userId,
          delta: diff,
          reason: 'Self-development bahosi',
          sourceType: 'self_development',
          sourceId: parsed.data.id,
          createdBy: ceoId,
        });
        return true;
      });
      if (changed) await bumpNavBadgeSignal(parsed.data.userId);
    } catch (error) {
      console.error('self-development star award failed', error instanceof Error ? error.message : error);
    }
  }

  revalidatePath('/[locale]/self-development', 'page');
  revalidatePath('/[locale]/staff', 'page');
  revalidatePath(`/[locale]/finance/${parsed.data.userId}`, 'page');
  return { success: true };
}

/** "Oyning eng yaxshi hisoboti": the CEO publishes one report to company
 * news so the learning reaches the whole team. */
export async function featureSelfDevReportAction(submissionId: string): Promise<SelfDevActionState> {
  let ceoId: string;
  try {
    ({
      user: { id: ceoId },
    } = await requireCap('selfDev.review'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(submissionId).success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ first_name: string; last_name: string; achievements: string | null; value_added: string | null; month: string }[]>`
      select p.first_name, p.last_name, sd.achievements, sd.value_added, sd.month::text as month
      from self_development sd join profiles p on p.id = sd.user_id where sd.id = ${submissionId}`;
    if (!row) return { error: 'submitFailed' };
    const content = [row.achievements, row.value_added && `Qo‘shgan qiymati: ${row.value_added}`].filter(Boolean).join('\n\n').slice(0, 4000);
    await sql`
      insert into company_news (title, content, created_by)
      values (${`🏆 Oyning eng yaxshi hisoboti — ${row.first_name} ${row.last_name}`.slice(0, 200)}, ${content || '—'}, ${ceoId})`;
  } catch {
    return { error: 'submitFailed' };
  }
  revalidatePath('/[locale]/company-news', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return { success: true };
}

/**
 * Take this month's report back to fix it (owner, 2026-10-08: a submit could
 * not be undone). Only the author, only for the current month, and only
 * while the CEO hasn't touched it — no score, no comment, no stars. The row
 * is removed, so the submit form comes back with the month still open.
 */
export async function withdrawSelfDevelopmentAction(submissionId: string): Promise<SelfDevActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };
  if (!z.string().uuid().safeParse(submissionId).success) return { error: 'invalidInput' };

  try {
    const res = await sql`
      delete from self_development sd
      where sd.id = ${submissionId} and sd.user_id = ${user.id}
        and sd.month = ${firstOfCurrentMonth()}
        and sd.ceo_score is null and sd.ceo_rating is null
        and not exists (
          select 1 from star_transactions st
          where st.source_type = 'self_development' and st.source_id = sd.id
        )
    `;
    if (res.count === 0) return { error: 'alreadyEvaluated' };
  } catch (error) {
    console.error('withdrawSelfDevelopmentAction failed', error instanceof Error ? error.message : error);
    return { error: 'submitFailed' };
  }

  revalidatePath('/[locale]/self-development', 'page');
  return { success: true };
}
