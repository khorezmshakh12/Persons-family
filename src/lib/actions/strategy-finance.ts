'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authErrorCode } from '@/lib/auth/require-admin';
import { requireStrategyEditor } from '@/lib/strategy-auth';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { tashkentDayKey } from '@/lib/time';

type Result = { error?: string };

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const count = z.number().int().min(0).max(1_000_000);

async function requireEditor(): Promise<{ id: string } | { error: string }> {
  try {
    const { profile } = await requireStrategyEditor();
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

const debtorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).default(''),
  courseId: z.string().uuid().nullable(),
  grp: z.string().trim().max(40).default(''),
  amount: z.number().finite().positive().max(1e11),
  dueDate: ymd,
});

export async function saveDebtorAction(input: z.input<typeof debtorSchema>): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = debtorSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      const res = await sql`
        update strategy_debtors set name = ${v.name}, phone = ${v.phone}, course_id = ${v.courseId},
          grp = ${v.grp}, amount = ${v.amount}, due_date = ${v.dueDate}
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      await sql`
        insert into strategy_debtors (name, phone, course_id, grp, amount, due_date, created_by)
        values (${v.name}, ${v.phone}, ${v.courseId}, ${v.grp}, ${v.amount}, ${v.dueDate}, ${g.id})`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

/** Remove a debtor. `paid` = the debt was settled: this month's "paid"
 * head-count (Tashkent month) goes up by one, as in the prototype. */
export async function removeDebtorAction(input: { id: string; paid: boolean }): Promise<Result> {
  const g = await requireEditor();
  if ('error' in g) return g;
  const p = z.object({ id: z.string().uuid(), paid: z.boolean() }).safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const month = tashkentDayKey().slice(0, 7);
  try {
    await sql.begin(async (tx) => {
      const res = await tx`delete from strategy_debtors where id = ${p.data.id} returning name, amount`;
      if (res.count === 0) throw new Error('notFound');
      if (p.data.paid) {
        await tx`
          insert into strategy_fin_months (ym, paid, updated_by) values (${month}, 1, ${g.id})
          on conflict (ym) do update set paid = strategy_fin_months.paid + 1,
            updated_by = excluded.updated_by, updated_at = now()`;
      }
    });
  } catch (e) {
    return { error: e instanceof Error && e.message === 'notFound' ? 'notFound' : 'updateFailed' };
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
  const g = await requireEditor();
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
