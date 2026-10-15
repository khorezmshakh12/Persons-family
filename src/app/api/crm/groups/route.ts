import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    name?: string; course?: string; teacher?: string; room?: string;
    days?: string; startTime?: string; tariff?: number | string; limit?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Guruh nomi majburiy' }, { status: 400 });
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
        insert into crm_groups (name, course_id, head_teacher_id, room_id, tariff_id, days, start_time, student_limit, status, created_by)
        values (${name}, ${courseId}, ${teacherId}, ${roomId}, ${tariffId}, ${body.days ?? null}, ${startTime}, ${studentLimit}, 'active', ${me.id})
        returning id`;
      return g.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[crm] create group failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
