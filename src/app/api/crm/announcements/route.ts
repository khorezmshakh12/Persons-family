import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi e'lon yaratish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { title?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const title = (body.title ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Sarlavha majburiy' }, { status: 400 });

  try {
    const [a] = await sql<{ id: string }[]>`insert into crm_announcements (title, body, created_by) values (${title}, ${(body.body ?? '').toString()}, ${me.id}) returning id`;
    return NextResponse.json({ ok: true, id: a.id });
  } catch (e) {
    console.error('[crm] create announcement failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Mavjud e'lonni arxivlash.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'E‘lon majburiy' }, { status: 400 });

  try {
    const res = await sql`update crm_announcements set archived_at = now() where id = ${body.id} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'E‘lon topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] archive announcement failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
