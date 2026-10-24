import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi kurs yaratish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Nom majburiy' }, { status: 400 });

  try {
    const [ex] = await sql`select id from crm_courses where lower(name) = lower(${name}) and archived_at is null limit 1`;
    if (ex) return NextResponse.json({ error: 'Bu nomli kurs allaqachon bor' }, { status: 400 });

    const [c] = await sql<{ id: string }[]>`insert into crm_courses (name, created_by) values (${name}, ${me.id}) returning id`;
    return NextResponse.json({ ok: true, id: c.id });
  } catch (e) {
    console.error('[crm] create course failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Mavjud kursni qayta nomlash.
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { courseId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const courseId = body.courseId ?? '';
  const name = (body.name ?? '').trim();
  if (!courseId || !name) return NextResponse.json({ error: 'Kurs va nom majburiy' }, { status: 400 });

  try {
    const res = await sql`update crm_courses set name = ${name.trim()} where id = ${courseId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'Kurs topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update course failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
