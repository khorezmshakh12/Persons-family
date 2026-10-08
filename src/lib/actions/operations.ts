'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { scoreLead } from '@/lib/ai-triage';
import { authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { requireCap } from '@/lib/auth/require-admin';

type Result = { error?: string };

const SOURCES = ['instagram', 'telegram', 'referral', 'walkin', 'website', 'other'] as const;
const STAGES = ['new', 'contacted', 'trial', 'enrolled', 'lost'] as const;

const leadSchema = z.object({
  id: z.string().uuid().optional(),
  // Optional: leads are intake statistics, a name is a convenience.
  name: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(40).default(''),
  source: z.enum(SOURCES),
  course: z.string().trim().max(120).default(''),
  stage: z.enum(STAGES),
  note: z.string().trim().max(1000).default(''),
});

export async function saveLeadAction(input: z.input<typeof leadSchema>): Promise<Result> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = leadSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  let leadId = v.id;
  try {
    if (v.id) {
      const res = await sql`
        update ops_leads set name = ${v.name || '—'}, phone = ${v.phone}, source = ${v.source}, course = ${v.course},
          stage = ${v.stage}, note = ${v.note}, updated_at = now(),
          enrolled_at = case when ${v.stage} = 'enrolled' then coalesce(enrolled_at, now()) else null end
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      const [row] = await sql<{ id: string }[]>`
        insert into ops_leads (name, phone, source, course, stage, note, owner_id, enrolled_at)
        values (${v.name || '—'}, ${v.phone}, ${v.source}, ${v.course}, ${v.stage}, ${v.note}, ${by},
          ${v.stage === 'enrolled' ? sql`now()` : null})
        returning id`;
      leadId = row.id;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  // TypeSafe intent score after the response (best-effort, never blocks).
  if (leadId) {
    const id = leadId;
    after(async () => {
      await scoreLead(id);
    });
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}

export async function deleteLeadAction(id: string): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from ops_leads where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}

/* ---------------------------------------------------- plan / rooms / slots */
const done = (): Result => {
  revalidatePath('/[locale]/operations', 'page');
  return {};
};

const rate = z.number().min(0).max(100);
const scenarioSchema = z.object({ churn: rate, trial: rate, conv: rate, cpl: z.number().min(0).max(1e9), ctr: rate });
const planSchema = z.object({
  target: z.number().int().min(0).max(100000),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')),
  seats: z.number().int().min(1).max(200),
  workDays: z.number().int().min(1).max(7),
  scenarios: z.object({ worst: scenarioSchema, average: scenarioSchema, best: scenarioSchema }),
});

export async function savePlanAction(input: z.input<typeof planSchema>): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = planSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into ops_settings (key, value) values ('plan', ${sql.json(p.data)})
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const roomSchema = z.object({
  code: z.string().trim().min(1).max(60),
  title: z.string().trim().max(80).default(''),
  capacity: z.number().int().min(1).max(200),
  note: z.string().trim().max(200).default(''),
});
export async function saveRoomAction(input: z.input<typeof roomSchema>): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = roomSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    await sql`
      insert into ops_rooms (code, title, capacity, note) values (${v.code}, ${v.title}, ${v.capacity}, ${v.note})
      on conflict (code) do update set title = excluded.title, capacity = excluded.capacity, note = excluded.note`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteRoomAction(code: string): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().min(1).max(60).safeParse(code).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from ops_rooms where code = ${code}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function setGroupEnrollmentAction(groupId: string, enrolled: number): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(groupId).success || !z.number().int().min(0).max(500).safeParse(enrolled).success) return { error: 'invalidInput' };
  try {
    await sql`
      insert into ops_group_enrollment (group_id, enrolled) values (${groupId}, ${enrolled})
      on conflict (group_id) do update set enrolled = excluded.enrolled, updated_at = now()`;
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const holdSchema = z.object({
  id: z.string().uuid().optional(),
  room: z.string().trim().min(1).max(60),
  time: z.string().trim().min(1).max(20),
  cohort: z.enum(['odd', 'even']),
  kind: z.enum(['trial', 'buffer']),
  title: z.string().trim().max(120).default(''),
});
export async function saveSlotHoldAction(input: z.input<typeof holdSchema>): Promise<Result> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = holdSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const v = p.data;
  try {
    if (v.id) {
      // Update existing hold with guarded check
      const res = await sql`
        update ops_slot_holds
        set kind = ${v.kind}, title = ${v.title}, updated_at = now()
        where id = ${v.id}`;
      if (res.count === 0) return { error: 'notFound' };
    } else {
      // Create new hold or update via conflict on natural key
      await sql`
        insert into ops_slot_holds (room, slot_time, cohort, kind, title, created_by)
        values (${v.room}, ${v.time}, ${v.cohort}, ${v.kind}, ${v.title}, ${by})
        on conflict (room, slot_time, cohort) do update set kind = excluded.kind, title = excluded.title`;
    }
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

export async function deleteSlotHoldAction(id: string): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(id).success) return { error: 'invalidInput' };
  try {
    const res = await sql`delete from ops_slot_holds where id = ${id}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  return done();
}

const intakeSchema = z.object({
  source: z.enum(SOURCES),
  course: z.string().trim().max(120).default(''),
  count: z.number().int().min(1).max(30),
});

/** "+1" intake logging: N anonymous arrivals from one source, for the
 * statistics only (no names, no follow-up — this is not a student CRM). */
export async function quickIntakeAction(input: z.input<typeof intakeSchema>): Promise<Result> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = intakeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const rows = Array.from({ length: p.data.count }, () => ({
      name: '—',
      phone: '',
      source: p.data.source,
      course: p.data.course,
      stage: 'new',
      note: '',
      owner_id: by,
    }));
    await sql`insert into ops_leads ${sql(rows)}`;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}

const placeSchema = z.object({
  groupId: z.string().uuid(),
  room: z.string().trim().min(1).max(40),
  time: z.string().trim().regex(/^\d{1,2}:\d{2}$/),
  cohort: z.enum(['odd', 'even']),
});

/** Put an unscheduled group into a free room/time/cohort slot. Refuses a
 * slot another group already holds, and a time its teacher already teaches. */
export async function placeGroupAction(input: z.input<typeof placeSchema>): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = placeSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  const { groupId, room, time, cohort } = p.data;
  try {
    const [clash] = await sql<{ kind: string }[]>`
      select case when trim(g.configuration->>'room') = ${room} then 'slotTaken' else 'teacherBusy' end as kind
      from groups g, (select teacher_id from groups where id = ${groupId}) me
      where g.id <> ${groupId} and g.schedule_type = ${cohort} and g.configuration->>'time' = ${time}
        and (trim(g.configuration->>'room') = ${room} or g.teacher_id = me.teacher_id)
      limit 1`;
    if (clash) return { error: clash.kind };
    const res = await sql`
      update groups set schedule_type = ${cohort},
        configuration = coalesce(configuration, '{}'::jsonb) || ${sql.json({ room, time })}
      where id = ${groupId}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  revalidatePath('/[locale]/lesson-plans', 'page');
  return {};
}
