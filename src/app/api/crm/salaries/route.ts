import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Oylik (oylik fondi) yozuvi qo'shish: qaysi oy (period 'YYYY-MM'), kim, summa.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { period?: string; name?: string; teacherId?: string; amount?: number | string; note?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const period = (body.period ?? '').slice(0, 7);
  const name = (body.name ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'To‘g‘ri oy (YYYY-MM) majburiy' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Kim uchun ekani majburiy' }, { status: 400 });
  const amount = Math.max(0, Math.round(Number(body.amount) || 0));
  const teacherId = body.teacherId ? body.teacherId : null;
  const note = (body.note ?? '').toString().trim() || null;
  const branch = ['persons_lc', 'pekin', 'social', 'it'].includes(body.branch ?? '') ? body.branch! : 'persons_lc';

  try {
    const [r] = await sql<{ id: string }[]>`
      insert into crm_salaries (period, name, teacher_id, amount, note, branch, created_by)
      values (${period}, ${name}, ${teacherId}, ${amount}, ${note}, ${branch}, ${me.id})
      returning id`;
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error('[crm] create salary failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Oylik yozuvini o'chirish.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }
  const id = body.id ?? '';
  if (!id) return NextResponse.json({ error: 'Yozuv majburiy' }, { status: 400 });

  try {
    const res = await sql`delete from crm_salaries where id = ${id}`;
    if (res.count === 0) return NextResponse.json({ error: 'Yozuv topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete salary failed', e);
    return NextResponse.json({ error: 'O‘chirishda xatolik' }, { status: 500 });
  }
}
