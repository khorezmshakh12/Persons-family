import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    name?: string; course?: string; teacher?: string; room?: string;
    days?: string; startTime?: string; tariff?: number | string; limit?: number | string; branch?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Guruh nomi majburiy' }, { status: 400 });
  const branch = ['persons_lc', 'pekin', 'social', 'it'].includes(body.branch ?? '') ? body.branch! : 'persons_lc';
  const startTime = /^\d{2}:\d{2}$/.test(body.startTime ?? '') ? body.startTime! : null;
  const studentLimit = Math.max(1, Math.round(Number(body.limit) || 12));
  const tariff = Number(body.tariff) || 0;

  try {
    const id = await sql.begin(async (tx) => {
      // Nomi bo'yicha topadi yoki yangi yaratadi — baza bo'sh bo'lsa ham ishlaydi.
      const course = (body.course ?? '').trim();
      const teacher = (body.teacher ?? '').trim();
      const room = (body.room ?? '').trim();

      let courseId: string | null = null;
      if (course) {
        const [r] = await tx<{ id: string }[]>`insert into crm_courses (name, created_by) values (${course}, ${me.id}) on conflict do nothing returning id`;
        courseId = r?.id ?? (await tx<{ id: string }[]>`select id from crm_courses where name = ${course} limit 1`)[0]?.id ?? null;
      }
      let teacherId: string | null = null;
      if (teacher) {
        const [r] = await tx<{ id: string }[]>`select id from crm_teachers where lower(display_name) = lower(${teacher}) and archived_at is null limit 1`;
        teacherId = r?.id ?? (await tx<{ id: string }[]>`insert into crm_teachers (display_name, created_by) values (${teacher}, ${me.id}) returning id`)[0].id;
      }
      let roomId: string | null = null;
      if (room) {
        const [r] = await tx<{ id: string }[]>`select id from crm_rooms where lower(name) = lower(${room}) and archived_at is null limit 1`;
        roomId = r?.id ?? (await tx<{ id: string }[]>`insert into crm_rooms (name) values (${room}) returning id`)[0].id;
      }

      let tariffId: string | null = null;
      if (tariff > 0) {
        const [t] = await tx<{ id: string }[]>`insert into crm_tariffs (course_id, name, amount, created_by) values (${courseId}, ${name}, ${tariff}, ${me.id}) returning id`;
        tariffId = t.id;
      }

      const [g] = await tx<{ id: string }[]>`
        insert into crm_groups (name, course_id, head_teacher_id, room_id, tariff_id, days, start_time, student_limit, status, branch, created_by)
        values (${name}, ${courseId}, ${teacherId}, ${roomId}, ${tariffId}, ${body.days ?? null}, ${startTime}, ${studentLimit}, 'active', ${branch}, ${me.id})
        returning id`;
      return g.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[crm] create group failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Mavjud guruhni tahrirlash (nom, kunlar, vaqt, xona, o'rinlar, kurs, o'qituvchi).
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { groupId?: string; name?: string; course?: string; teacher?: string; room?: string; days?: string; startTime?: string; limit?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const groupId = body.groupId ?? '';
  const name = (body.name ?? '').trim();
  if (!groupId || !name) return NextResponse.json({ error: 'Guruh va nomi majburiy' }, { status: 400 });
  const startTime = /^\d{2}:\d{2}$/.test(body.startTime ?? '') ? body.startTime! : null;
  const studentLimit = Math.max(1, Math.round(Number(body.limit) || 12));

  try {
    const ok = await sql.begin(async (tx) => {
      const course = (body.course ?? '').trim();
      const teacher = (body.teacher ?? '').trim();
      const room = (body.room ?? '').trim();

      let courseId: string | null = null;
      if (course) {
        const [r] = await tx<{ id: string }[]>`insert into crm_courses (name, created_by) values (${course}, ${me.id}) on conflict do nothing returning id`;
        courseId = r?.id ?? (await tx<{ id: string }[]>`select id from crm_courses where name = ${course} limit 1`)[0]?.id ?? null;
      }
      let teacherId: string | null = null;
      if (teacher) {
        const [r] = await tx<{ id: string }[]>`select id from crm_teachers where lower(display_name) = lower(${teacher}) and archived_at is null limit 1`;
        teacherId = r?.id ?? (await tx<{ id: string }[]>`insert into crm_teachers (display_name, created_by) values (${teacher}, ${me.id}) returning id`)[0].id;
      }
      let roomId: string | null = null;
      if (room) {
        const [r] = await tx<{ id: string }[]>`select id from crm_rooms where lower(name) = lower(${room}) and archived_at is null limit 1`;
        roomId = r?.id ?? (await tx<{ id: string }[]>`insert into crm_rooms (name) values (${room}) returning id`)[0].id;
      }

      // Bo'sh qoldirilgan bog'lanishlar (course/teacher/room) o'zgarmaydi — coalesce.
      const res = await tx`
        update crm_groups set
          name = ${name},
          days = ${body.days ?? null},
          start_time = ${startTime},
          student_limit = ${studentLimit},
          course_id = coalesce(${courseId}, course_id),
          head_teacher_id = coalesce(${teacherId}, head_teacher_id),
          room_id = coalesce(${roomId}, room_id)
        where id = ${groupId} and archived_at is null`;
      return res.count > 0;
    });
    if (!ok) return NextResponse.json({ error: 'Guruh topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update group failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Guruhni arxivlash (yumshoq o'chirish).
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });
  let body: { groupId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }
  if (!body.groupId) return NextResponse.json({ error: 'Guruh majburiy' }, { status: 400 });
  try {
    const res = await sql`update crm_groups set archived_at = now(), status = 'archived' where id = ${body.groupId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'Guruh topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] archive group failed', e);
    return NextResponse.json({ error: 'O‘chirishda xatolik' }, { status: 500 });
  }
}
