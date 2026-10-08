'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { scoreLead } from '@/lib/ai-triage';
import { authErrorCode } from '@/lib/auth/require-admin';
import { sql } from '@/lib/db/client';
import { requireCap } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { DEFAULT_DURATION, isBlocking, issuesFor, scheduleIssues, type Availability, type SchedGroup } from '@/lib/ops-schedule';

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

/* ------------------------------------------------------------ schedule moves */

const placementSchema = z.object({
  groupId: z.string().uuid(),
  room: z.string().trim().min(1).max(60),
  time: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  cohort: z.enum(['odd', 'even']),
  duration: z.number().int().min(30).max(240).optional(),
});
type PlacementInput = z.infer<typeof placementSchema>;

export type MoveResult = Result & { issues?: string[]; warnings?: string[]; logId?: string };

/** Current schedule as the scheduling lib sees it (inside `tx` when given). */
async function loadSchedule(db: typeof sql = sql): Promise<{ groups: SchedGroup[]; cap: (room: string) => number; availability: Availability[] }> {
  const [groups, rooms, availability] = await Promise.all([
    db<SchedGroup[]>`
      select g.id, g.name, coalesce(g.course_name, '') as course, g.schedule_type as cohort,
        coalesce(g.configuration->>'time', '') as time, coalesce(trim(g.configuration->>'room'), '') as room,
        g.teacher_id, coalesce(p.first_name || ' ' || p.last_name, '') as teacher,
        coalesce((g.configuration->>'duration')::int, ${DEFAULT_DURATION}) as duration, e.enrolled
      from groups g left join profiles p on p.id = g.teacher_id
      left join ops_group_enrollment e on e.group_id = g.id`,
    db<{ code: string; capacity: number }[]>`select code, capacity from ops_rooms`,
    db<Availability[]>`select teacher_id, cohort, start_time as start, end_time as end from ops_teacher_availability`.catch(() => []),
  ]);
  const caps = new Map(rooms.map((r) => [r.code, r.capacity]));
  return { groups, cap: (room) => caps.get(room) ?? 0, availability };
}

/** Apply one validated placement + its audit row (inside a transaction). */
async function writePlacement(tx: typeof sql, by: string, g: SchedGroup, p: PlacementInput): Promise<string> {
  const duration = p.duration ?? g.duration;
  await tx`
    update groups set schedule_type = ${p.cohort},
      configuration = coalesce(configuration, '{}'::jsonb) || ${tx.json({ room: p.room, time: p.time, duration })}
    where id = ${g.id}`;
  const [log] = await tx<{ id: string }[]>`
    insert into ops_schedule_log (group_id, actor, before, after)
    values (${g.id}, ${by},
      ${tx.json({ room: g.room || null, time: g.time || null, cohort: g.cohort, duration: g.duration })},
      ${tx.json({ room: p.room, time: p.time, cohort: p.cohort, duration })})
    returning id`;
  return log.id;
}

/**
 * Move (or first place) a group. Room and teacher clashes are refused;
 * over-capacity and outside-availability come back as warnings and are
 * applied only with `force`. Every move is logged (and undoable).
 */
export async function moveGroupAction(input: z.input<typeof placementSchema> & { force?: boolean }): Promise<MoveResult> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = placementSchema.safeParse(input);
  if (!p.success) return { error: 'invalidInput' };
  try {
    const out = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('ops_schedule'))`;
      const { groups, cap, availability } = await loadSchedule(tx as unknown as typeof sql);
      const g = groups.find((x) => x.id === p.data.groupId);
      if (!g) return { error: 'notFound' } as MoveResult;
      const issues = issuesFor(g, { ...p.data, duration: p.data.duration ?? g.duration }, groups, cap, availability);
      const blocking = issues.filter(isBlocking).map((i) => i.text);
      if (blocking.length) return { error: 'conflict', issues: blocking } as MoveResult;
      const warnings = issues.filter((i) => !isBlocking(i)).map((i) => i.text);
      if (warnings.length && !input.force) return { error: 'warning', warnings } as MoveResult;
      const logId = await writePlacement(tx as unknown as typeof sql, by, g, p.data);
      return { logId, warnings } as MoveResult;
    });
    if (out.error) return out;
    revalidatePath('/[locale]/operations', 'page');
    revalidatePath('/[locale]/lesson-plans', 'page');
    return out;
  } catch {
    return { error: 'updateFailed' };
  }
}

/** Kept for the chip-drop flow: first placement of an unscheduled group. */
export async function placeGroupAction(input: z.input<typeof placementSchema>): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const r = await moveGroupAction({ ...input, force: true });
  return r.error ? { error: r.error === 'conflict' ? 'slotTaken' : r.error } : {};
}

/** Undo one logged move: put the group back where it was. */
export async function undoMoveAction(logId: string): Promise<Result> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  if (!z.string().uuid().safeParse(logId).success) return { error: 'invalidInput' };
  try {
    const res = await sql.begin(async (tx) => {
      const [log] = await tx<{ group_id: string; before: { room: string | null; time: string | null; cohort: 'odd' | 'even' | null; duration: number } }[]>`
        select group_id, before from ops_schedule_log where id = ${logId}`;
      if (!log) return false;
      const b = log.before;
      await tx`
        update groups set schedule_type = ${b.cohort},
          configuration = coalesce(configuration, '{}'::jsonb) || ${tx.json({ room: b.room, time: b.time, duration: b.duration })}
        where id = ${log.group_id}`;
      await tx`insert into ops_schedule_log (group_id, actor, before, after) select group_id, ${by}, after, before from ops_schedule_log where id = ${logId}`;
      return true;
    });
    if (!res) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}

/**
 * Draft mode: apply every move at once. The final schedule is validated as
 * a whole (so swaps work); any room/teacher clash rejects the lot.
 */
export async function applyScheduleDraftAction(moves: z.input<typeof placementSchema>[]): Promise<MoveResult> {
  let by: string;
  try {
    ({ profile: { id: by } } = await requireCap('operations.edit'));
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const parsed = z.array(placementSchema).min(1).max(200).safeParse(moves);
  if (!parsed.success) return { error: 'invalidInput' };
  try {
    const out = await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('ops_schedule'))`;
      const { groups, cap, availability } = await loadSchedule(tx as unknown as typeof sql);
      const byId = new Map(groups.map((g) => [g.id, g]));
      const after: SchedGroup[] = groups.map((g) => {
        const m = parsed.data.find((x) => x.groupId === g.id);
        return m ? { ...g, room: m.room, time: m.time, cohort: m.cohort, duration: m.duration ?? g.duration } : g;
      });
      const blocking = scheduleIssues(after, cap, availability).filter(isBlocking);
      if (blocking.length) return { error: 'conflict', issues: blocking.map((i) => i.text) } as MoveResult;
      for (const m of parsed.data) {
        const g = byId.get(m.groupId);
        if (g) await writePlacement(tx as unknown as typeof sql, by, g, m);
      }
      return {} as MoveResult;
    });
    if (out.error) return out;
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  revalidatePath('/[locale]/lesson-plans', 'page');
  return {};
}

/* ------------------------------------------------------------ rooms & teachers */

export async function setRoomFeaturesAction(code: string, features: string[]): Promise<Result> {
  try {
    await requireCap('operations.edit');
  } catch (error) {
    return { error: authErrorCode(error) };
  }
  const p = z.array(z.string().trim().min(1).max(40)).max(12).safeParse(features);
  if (!p.success || !code) return { error: 'invalidInput' };
  try {
    const res = await sql`update ops_rooms set features = ${p.data} where code = ${code}`;
    if (res.count === 0) return { error: 'notFound' };
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}

const windowSchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

/** A teacher's working windows on one cohort (replaces the old set). The
 * teacher edits their own; operations can edit anyone's. */
export async function setTeacherAvailabilityAction(teacherId: string, cohort: 'odd' | 'even', windows: z.input<typeof windowSchema>[]): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'sessionExpired' };
  if (teacherId !== user.id && !can(profile.role, 'operations.edit')) return { error: 'forbidden' };
  const p = z.array(windowSchema).max(8).safeParse(windows);
  if (!p.success || !z.string().uuid().safeParse(teacherId).success || !['odd', 'even'].includes(cohort)) return { error: 'invalidInput' };
  if (p.data.some((w) => w.start >= w.end)) return { error: 'invalidInput' };
  try {
    await sql.begin(async (tx) => {
      await tx`delete from ops_teacher_availability where teacher_id = ${teacherId} and cohort = ${cohort}`;
      if (p.data.length)
        await tx`insert into ops_teacher_availability ${tx(p.data.map((w) => ({ teacher_id: teacherId, cohort, start_time: w.start, end_time: w.end })))}`;
    });
  } catch {
    return { error: 'updateFailed' };
  }
  revalidatePath('/[locale]/operations', 'page');
  return {};
}
