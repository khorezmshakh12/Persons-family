import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi o'qituvchi yaratish.
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
  if (!name) return NextResponse.json({ error: 'Ism majburiy' }, { status: 400 });

  try {
    const [t] = await sql<{ id: string }[]>`insert into crm_teachers (display_name, created_by) values (${name}, ${me.id}) returning id`;
    return NextResponse.json({ ok: true, id: t.id });
  } catch (e) {
    console.error('[crm] create teacher failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Mavjud o'qituvchini tahrirlash (ism).
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { teacherId?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const teacherId = body.teacherId ?? '';
  const name = (body.name ?? '').trim();
  if (!teacherId || !name) return NextResponse.json({ error: 'O‘qituvchi va ism majburiy' }, { status: 400 });

  try {
    const res = await sql`update crm_teachers set display_name = ${name.trim()} where id = ${teacherId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'O‘qituvchi topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update teacher failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
