import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Imtihon natijasini qo'shish (ball, sertifikat, izoh).
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    studentId?: string; groupName?: string; name?: string; date?: string;
    score?: number | string; maxScore?: number | string; passed?: boolean;
    cert?: boolean; note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!body.studentId || !name) {
    return NextResponse.json({ error: 'O‘quvchi va imtihon nomi majburiy' }, { status: 400 });
  }
  const examDate = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : null;
  const score = body.score === '' || body.score == null ? null : Math.round(Number(body.score) || 0);
  const maxScore = Math.max(1, Math.round(Number(body.maxScore) || 100));

  try {
    const [r] = await sql<{ id: string }[]>`insert into crm_exams (student_id, group_name, name, exam_date, score, max_score, passed, cert, note, created_by) values (${body.studentId}, ${body.groupName ?? null}, ${body.name!.trim()}, ${examDate}, ${score}, ${maxScore}, ${!!body.passed}, ${!!body.cert}, ${body.note ?? null}, ${me.id}) returning id`;
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error('[crm] create exam failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Imtihon natijasini o'chirish.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  if (!body.id) return NextResponse.json({ error: 'Yozuv majburiy' }, { status: 400 });
  try {
    const res = await sql`delete from crm_exams where id=${body.id}`;
    if (res.count === 0) return NextResponse.json({ error: 'Topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete exam failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
