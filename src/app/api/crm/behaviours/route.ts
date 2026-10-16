import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// O'quvchiga xulq belgisini qo'shish: ijobiy yoki salbiy ball. Belgi o'quvchi
// ballini ham o'zgartiradi (ijobiy qo'shadi, salbiy ayiradi; 0 dan pastga
// tushmaydi) — belgi va ball bitta tranzaksiyada.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { studentId?: string; kind?: string; points?: number | string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const studentId = body.studentId ?? '';
  const kind = body.kind ?? '';
  if (!studentId || !['positive', 'negative'].includes(kind)) {
    return NextResponse.json({ error: 'O‘quvchi va tur majburiy' }, { status: 400 });
  }
  const points = Math.max(0, Math.round(Number(body.points) || 0));

  try {
    const id = await sql.begin(async (tx) => {
      const [b] = await tx<{ id: string }[]>`
        insert into crm_behaviours (student_id, kind, points, note, created_by)
        values (${studentId}, ${kind}, ${points}, ${body.note ?? null}, ${me.id})
        returning id`;
      const delta = kind === 'positive' ? points : -points;
      await tx`update crm_students set scores = greatest(0, scores + ${delta}), updated_at = now() where id = ${studentId}`;
      return b.id;
    });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    console.error('[crm] add behaviour failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Xulq belgisini o'chirish va uning ball ta'sirini teskari qaytarish —
// bitta tranzaksiyada (0 dan pastga tushmaydi).
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const id = body.id;
  if (!id) return NextResponse.json({ error: 'Yozuv majburiy' }, { status: 400 });

  try {
    const ok = await sql.begin(async (tx) => {
      const [row] = await tx<{ student_id: string; kind: string; points: number }[]>`
        select student_id, kind, points from crm_behaviours where id = ${id}`;
      if (!row) return false;
      await tx`delete from crm_behaviours where id = ${id}`;
      const delta = row.kind === 'positive' ? -row.points : row.points;
      await tx`update crm_students set scores = greatest(0, scores + ${delta}), updated_at = now() where id = ${row.student_id}`;
      return true;
    });
    if (!ok) return NextResponse.json({ error: 'Yozuv topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete behaviour failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
