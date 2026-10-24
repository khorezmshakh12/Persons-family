'use server';

import { revalidatePath } from 'next/cache';
import { getAuthState } from '@/lib/auth/session';
import { can } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { ensureSyllabusTagged, lessonTypeForPosition } from '@/lib/syllabus';

type Result = { error: string } | { ok: true; count?: number };

async function gateGroup(groupId: string, userId: string, role: string): Promise<{ error: string } | { ok: true }> {
  const [g] = await sql<{ teacher_id: string }[]>`select teacher_id from groups where id = ${groupId}`;
  if (!g) return { error: 'notFound' };
  if (g.teacher_id === userId || can(role, 'academic.manage')) return { ok: true };
  return { error: 'forbidden' };
}

/** Guruh darslarini sana tartibida 1..N raqamlaydi va test turlarini qo'yadi. */
export async function tagSyllabusAction(groupId: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const g = await gateGroup(groupId, user.id, profile.role);
  if ('error' in g) return g;
  try {
    const lessons = await sql<{ id: string }[]>`
      select id from course_lessons where group_id = ${groupId}
      order by lesson_date asc nulls last, lesson_number asc`;
    for (let i = 0; i < lessons.length; i++) {
      const pos = i + 1;
      await sql`update course_lessons set syllabus_position = ${pos}, lesson_type = ${lessonTypeForPosition(pos)} where id = ${lessons[i].id}`;
    }
    await ensureSyllabusTagged(groupId); // imtihon kunlarini to'ldiradi
    revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
    return { ok: true, count: lessons.length };
  } catch (e) {
    console.error('[syllabus] tag failed', e);
    return { error: 'failed' };
  }
}

/** Excel'dan ko'chirilgan CSV («dars#,mavzu» qatorlar) — pozitsiya bo'yicha
 * mavzularni to'ldiradi. Avval «Rejani belgilash» ishga tushirilishi kerak. */
export async function importTopicsAction(groupId: string, csv: string): Promise<Result> {
  const { user, profile } = await getAuthState();
  if (!user || !profile) return { error: 'auth' };
  const g = await gateGroup(groupId, user.id, profile.role);
  if ('error' in g) return g;
  const pairs: { pos: number; topic: string }[] = [];
  for (const raw of (csv ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const comma = line.indexOf(',');
    if (comma < 0) continue;
    const pos = parseInt(line.slice(0, comma).trim(), 10);
    const topic = line.slice(comma + 1).trim().replace(/^"|"$/g, '');
    if (Number.isFinite(pos) && pos > 0 && topic) pairs.push({ pos, topic: topic.slice(0, 500) });
  }
  if (!pairs.length) return { error: 'empty' };
  try {
    let count = 0;
    for (const p of pairs) {
      const res = await sql`update course_lessons set topic = ${p.topic} where group_id = ${groupId} and syllabus_position = ${p.pos}`;
      count += res.count;
    }
    revalidatePath('/[locale]/lesson-plans/[groupId]', 'page');
    return { ok: true, count };
  } catch (e) {
    console.error('[syllabus] import failed', e);
    return { error: 'failed' };
  }
}
