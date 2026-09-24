'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { requireStrategyEditor } from '@/lib/strategy-auth';
import { sql } from '@/lib/db/client';

type Result = { error?: string };

const SOURCES = ['instagram', 'telegram', 'referral', 'walkin', 'website', 'other'] as const;
const STAGES = ['new', 'contacted', 'trial', 'enrolled', 'lost'] as const;

const leadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(''),
  source: z.enum(SOURCES),
  course: z.string().trim().max(120).default(''),
  stage: z.enum(STAGES),
  note: z.string().trim().max(1000).default(''),
});

export async function saveLeadAction(input: z.input<typeof leadSchema>): Promise<Result> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireStrategyEditor());
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = leadSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const res = await sql`
        update ops_leads set name = ${v.name}, phone = ${v.phone}, source = ${v.source}, course = ${v.course},
          stage = ${v.stage}, note = ${v.note}, updated_at = now(),
          enrolled_at = case when ${v.stage} = 'enrolled' then coalesce(enrolled_at, now()) else null end
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into ops_leads (name, phone, source, course, stage, note, owner_id, enrolled_at)
        values (${v.name}, ${v.phone}, ${v.source}, ${v.course}, ${v.stage}, ${v.note}, ${by},
          ${v.stage === 'enrolled' ? sql`now()` : null})`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy/operations', 'page');
  return {};
}

export async function deleteLeadAction(id: string): Promise<Result> {
  try {
    await requireStrategyEditor();
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    await sql`delete from ops_leads where id = ${id}`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/strategy/operations', 'page');
  return {};
}
