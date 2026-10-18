import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi xarajat qo'shish.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { category?: string; amount?: number | string; date?: string; note?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const amount = Number(body.amount) || 0;
  if (amount <= 0) return NextResponse.json({ error: 'Summa majburiy' }, { status: 400 });
  const todayTk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const spentAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : todayTk;
  const branch = ['persons_lc', 'pekin', 'social', 'it'].includes(body.branch ?? '') ? body.branch! : 'persons_lc';

  try {
    const [e] = await sql<{ id: string }[]>`
      insert into crm_expenses (category, amount, spent_at, note, branch, created_by)
      values (${(body.category ?? '').trim() || null}, ${amount}, ${spentAt}, ${body.note ?? null}, ${branch}, ${me.id})
      returning id`;
    return NextResponse.json({ ok: true, id: e.id });
  } catch (err) {
    console.error('[crm] create expense failed', err);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Xarajatni tahrirlash.
export async function PATCH(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { expenseId?: string; category?: string; amount?: number | string; date?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const amount = Number(body.amount) || 0;
  if (!body.expenseId || amount <= 0) return NextResponse.json({ error: 'Xarajat va summa majburiy' }, { status: 400 });
  const todayTk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const spentAt = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '') ? body.date! : todayTk;

  try {
    const res = await sql`update crm_expenses set category = ${(body.category ?? '').trim() || null}, amount = ${amount}, spent_at = ${spentAt}, note = ${body.note ?? null} where id = ${body.expenseId}`;
    if (res.count === 0) return NextResponse.json({ error: 'Xarajat topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[crm] update expense failed', err);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// Xarajatni o'chirish.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { expenseId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  if (!body.expenseId) return NextResponse.json({ error: 'Xarajat majburiy' }, { status: 400 });

  try {
    const res = await sql`delete from crm_expenses where id = ${body.expenseId}`;
    if (res.count === 0) return NextResponse.json({ error: 'Xarajat topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[crm] delete expense failed', err);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
