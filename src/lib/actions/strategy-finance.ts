'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { requireCap } from '@/lib/auth/require-admin';

type Result = { error?: string };

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const count = z.number().int().min(0).max(1_000_000);

async function requireEditor(cap: 'strategy.edit' | 'strategy.finance' = 'strategy.finance'): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireCap(cap);
    return { id: profile.id };
  } catch (error) {
    return { error: authErrorCode(error) };
  }
}

function done(): Result {
  revalidatePath('/[locale]/strategy', 'page');
  return {};
}

const settingsSchema = z.object({
  rooms: count,
  seats: count,
  shifts: z
    .array(z.object({ t: z.string().trim().min(1).max(20), p: z.number().finite().min(0).max(100) }))
    .max(8),
  target: z.number().finite().min(0).max(100),
});

/** Capacity (rooms × seats × shifts, shift mix) and the gross-margin target. */
export async function saveFinSettingsAction(input: z.input<typeof settingsSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = settingsSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into acct_settings (key, value) values ('strategy_fin', ${sql.json(p.data)})
      on conflict (key) do update set value = excluded.value`;
  } catch {
    return { error: 'updateFailed' };
  }
  logSystemAction('strategy.fin_settings', JSON.stringify(p.data));
  return done();
}

const monthSchema = z.object({
  ym,
  students: count.nullable(),
  paid: count,
  /** null = take enrolments from Operatsiya HQ leads. */
  newStudents: count.nullable(),
  capacity: count.nullable(),
});

export async function saveFinMonthAction(input: z.input<typeof monthSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = monthSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    await sql`
      insert into strategy_fin_months (ym, students, paid, new_students, capacity, updated_by)
      values (${v.ym}, ${v.students}, ${v.paid}, ${v.newStudents}, ${v.capacity}, ${g.id})
      on conflict (ym) do update set students = excluded.students, paid = excluded.paid,
        new_students = excluded.new_students, capacity = excluded.capacity,
        updated_by = excluded.updated_by, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const linksSchema = z.object({
  roadmapId: z.string().uuid(),
  nodeId: z.string().regex(/^[a-z0-9-]{1,20}$/),
  links: z
    .array(
      z.object({
        k: z.enum(['DOC', 'SHEET', 'LINK']),
        t: z.string().trim().min(1).max(120),
        url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u)),
      }),
    )
    .max(20),
});

/** Roadmap node resources (DOC / SHEET / LINK). One key per call — editors
 * working on different nodes never overwrite each other. */
export async function setRoadmapNodeLinksAction(input: z.input<typeof linksSchema>): Promise<Result> {
  const g = await requireEditor('strategy.edit');
  if ('error' in g) return g;
  const p = linksSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { roadmapId, nodeId, links } = p.data;
  try {
    const res = await sql`
      update strategy_roadmaps
      set node_links = jsonb_set(node_links, ${[nodeId]}::text[], ${sql.json(links)}::jsonb, true)
      where id = ${roadmapId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}
