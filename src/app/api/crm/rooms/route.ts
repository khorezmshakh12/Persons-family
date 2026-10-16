import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi xona yaratish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { name?: string; capacity?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Nom majburiy' }, { status: 400 });

  const cap = body.capacity === '' || body.capacity == null ? null : Math.max(0, Math.round(Number(body.capacity) || 0));

  try {
    const [r] = await sql<{ id: string }[]>`insert into crm_rooms (name, capacity) values (${name}, ${cap}) returning id`;
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error('[crm] create room failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Mavjud xonani tahrirlash (nom, sig'im).
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { roomId?: string; name?: string; capacity?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const roomId = body.roomId ?? '';
  const name = (body.name ?? '').trim();
  if (!roomId || !name) return NextResponse.json({ error: 'Xona va nom majburiy' }, { status: 400 });

  const cap = body.capacity === '' || body.capacity == null ? null : Math.max(0, Math.round(Number(body.capacity) || 0));

  try {
    const res = await sql`update crm_rooms set name = ${name}, capacity = ${cap} where id = ${roomId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'Xona topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] update room failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Xonani arxivlash.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const roomId = body.roomId ?? '';
  if (!roomId) return NextResponse.json({ error: 'Xona majburiy' }, { status: 400 });

  try {
    const res = await sql`update crm_rooms set archived_at = now() where id = ${roomId} and archived_at is null`;
    if (res.count === 0) return NextResponse.json({ error: 'Xona topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] archive room failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
