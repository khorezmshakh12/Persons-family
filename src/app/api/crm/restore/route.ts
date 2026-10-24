import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Arxivlangan o'quvchi yoki guruhni tiklash (archived_at = null, status faol).
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { type?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const { type, id } = body;
  if (!id || (type !== 'student' && type !== 'group')) {
    return NextResponse.json({ error: 'Tur va id majburiy' }, { status: 400 });
  }

  try {
    const res =
      type === 'student'
        ? await sql`update crm_students set archived_at = null, status = 'active' where id = ${id} and archived_at is not null`
        : await sql`update crm_groups set archived_at = null, status = 'active' where id = ${id} and archived_at is not null`;
    if (res.count === 0) return NextResponse.json({ error: 'Topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] restore failed', e);
    return NextResponse.json({ error: 'Tiklashda xatolik' }, { status: 500 });
  }
}
