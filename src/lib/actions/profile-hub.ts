'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { sql } from '@/lib/db/client';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { loadProfileMetrics, type ProfileMetrics } from '@/lib/profile-insights';

type Result<T = object> = ({ error?: undefined } & T) | { error: string };

const uuid = z.string().uuid();

/** Who may act: the person themself (`self`) and/or the CEO (`lead`). */
async function requireViewer(): Promise<{ id: string; lead: boolean } | { error: string }> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  return { id: user.id, lead: can(profile.role, 'company.overview') };
}

function done(staffId: string) {
  revalidatePath('/[locale]/profile', 'page');
  revalidatePath(`/[locale]/profile/${staffId}`, 'page');
}

export async function updateBioAction(staffId: string, bio: string): Promise<Result> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!uuid.safeParse(staffId).success) return { error: 'invalidInput' };
  if (g.id !== staffId && !g.lead) return { error: 'forbidden' };
  const b = z.string().trim().max(1000).safeParse(bio);
  if (!b.success) return { error: 'invalidInput' };
  try {
    await sql`update profiles set bio = ${b.data || null} where id = ${staffId}`;
  } catch {
    return { error: 'updateFailed' };
  }
  done(staffId);
  return {};
}

const skillSchema = z.object({ staffId: uuid, name: z.string().trim().min(2).max(60), level: z.number().int().min(1).max(5) });

export async function saveSkillAction(input: z.input<typeof skillSchema>): Promise<Result<{ id: string }>> {
  const g = await requireViewer();
  if ('error' in g) return g;
  const p = skillSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  if (g.id !== p.data.staffId && !g.lead) return { error: 'forbidden' };
  try {
    // A self-edited level drops the CEO's verification; a CEO edit keeps it.
    const [row] = await sql<{ id: string }[]>`
      insert into profile_skills (staff_id, name, level, verified_by, verified_at)
      values (${p.data.staffId}, ${p.data.name}, ${p.data.level}, ${g.lead ? g.id : null}, ${g.lead ? sql`now()` : null})
      on conflict (staff_id, name) do update set level = excluded.level,
        verified_by = case when ${g.lead} then excluded.verified_by else null end,
        verified_at = case when ${g.lead} then excluded.verified_at else null end
      returning id`;
    done(p.data.staffId);
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteSkillAction(id: string): Promise<Result> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ staff_id: string }[]>`
      delete from profile_skills where id = ${id} and (staff_id = ${g.id} or ${g.lead}) returning staff_id`;
    if (!row) return { error: 'forbidden' };
    done(row.staff_id);
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

export async function verifySkillAction(id: string, verified: boolean): Promise<Result> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ staff_id: string }[]>`
      update profile_skills set verified_by = ${verified ? g.id : null}, verified_at = ${verified ? sql`now()` : null}
      where id = ${id} returning staff_id`;
    if (!row) return { error: 'notFound' };
    done(row.staff_id);
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

const oneSchema = z.object({
  id: uuid.optional(),
  staffId: uuid,
  heldOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agenda: z.string().trim().max(4000).default(''),
  notes: z.string().trim().max(8000).default(''),
  mood: z.number().int().min(1).max(5).nullable().default(null),
});

/** 1:1 meeting notes: written by the CEO, visible to the employee too. */
export async function saveOneOnOneAction(input: z.input<typeof oneSchema>): Promise<Result<{ id: string }>> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  const p = oneSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    const [row] = v.id
      ? await sql<{ id: string }[]>`
          update one_on_ones set held_on = ${v.heldOn}, agenda = ${v.agenda}, notes = ${v.notes}, mood = ${v.mood}, updated_at = now()
          where id = ${v.id} and staff_id = ${v.staffId} returning id`
      : await sql<{ id: string }[]>`
          insert into one_on_ones (staff_id, lead_id, held_on, agenda, notes, mood)
          values (${v.staffId}, ${g.id}, ${v.heldOn}, ${v.agenda}, ${v.notes}, ${v.mood}) returning id`;
    if (!row) return { error: 'notFound' };
    done(v.staffId);
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deleteOneOnOneAction(id: string): Promise<Result> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ staff_id: string }[]>`delete from one_on_ones where id = ${id} returning staff_id`;
    if (!row) return { error: 'notFound' };
    done(row.staff_id);
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

/** CEO-only notes about a person — never shown to them. */
export async function addPrivateNoteAction(staffId: string, body: string): Promise<Result<{ id: string }>> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  const b = z.string().trim().min(2).max(2000).safeParse(body);
  if (!uuid.safeParse(staffId).success || !b.success) return { error: 'invalidInput' };
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into staff_private_notes (staff_id, author_id, body) values (${staffId}, ${g.id}, ${b.data}) returning id`;
    done(staffId);
    return { id: row.id };
  } catch {
    return { error: 'updateFailed' };
  }
}

export async function deletePrivateNoteAction(id: string): Promise<Result> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  if (!uuid.safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from staff_private_notes where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return {};
}

/** CEO: another person's 12-month metrics, to compare side by side. */
export async function getProfileMetricsAction(staffId: string): Promise<Result<{ metrics: ProfileMetrics; name: string }>> {
  const g = await requireViewer();
  if ('error' in g) return g;
  if (!g.lead) return { error: 'forbidden' };
  if (!uuid.safeParse(staffId).success) return { error: 'invalidInput' };
  try {
    const [p] = await sql<{ first_name: string | null; last_name: string | null }[]>`select first_name, last_name from profiles where id = ${staffId}`;
    if (!p) return { error: 'notFound' };
    return { metrics: await loadProfileMetrics(staffId), name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() };
  } catch {
    return { error: 'loadFailed' };
  }
}
