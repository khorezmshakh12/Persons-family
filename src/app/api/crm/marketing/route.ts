import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Marketing xarajati yozuvi: qachon (spent_at), kanal, summa. CAC uchun manba.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { spentAt?: string; channel?: string; amount?: number | string; note?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const spentAt = (body.spentAt ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentAt)) return NextResponse.json({ error: 'To‘g‘ri sana majburiy' }, { status: 400 });
  const amount = Math.max(0, Math.round(Number(body.amount) || 0));
  const channel = (body.channel ?? '').toString().trim() || null;
  const note = (body.note ?? '').toString().trim() || null;
  const branch = ['persons_lc', 'pekin', 'social', 'it'].includes(body.branch ?? '') ? body.branch! : 'persons_lc';

  try {
    const [r] = await sql<{ id: string }[]>`
      insert into crm_marketing_spend (spent_at, channel, amount, note, branch, created_by)
      values (${spentAt}, ${channel}, ${amount}, ${note}, ${branch}, ${me.id})
      returning id`;
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error('[crm] create marketing spend failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Marketing xarajati yozuvini o'chirish.
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
    const res = await sql`delete from crm_marketing_spend where id = ${id}`;
    if (res.count === 0) return NextResponse.json({ error: 'Yozuv topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete marketing spend failed', e);
    return NextResponse.json({ error: 'O‘chirishda xatolik' }, { status: 500 });
  }
}
