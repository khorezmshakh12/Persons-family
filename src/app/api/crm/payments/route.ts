import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Mavjud o'quvchidan to'lov qabul qilish. groupId berilsa shu guruhdagi faol
// abonementga bog'lanadi. Balans += summa (qaytarish bo'lsa −=). paidAt
// berilmasa bugungi Toshkent sanasi. idemKey ikki marta bosishdan himoya.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    studentId?: string; groupId?: string; amount?: number | string;
    method?: string; paidAt?: string; isRefund?: boolean; idemKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const studentId = body.studentId ?? '';
  const amount = Number(body.amount) || 0;
  if (!studentId || amount <= 0) {
    return NextResponse.json({ error: 'O‘quvchi va summa majburiy' }, { status: 400 });
  }
  const method = ['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other'].includes(body.method ?? '')
    ? body.method!
    : 'cash';
  const isRefund = !!body.isRefund;
  const todayTk = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(body.paidAt ?? '') ? body.paidAt! : todayTk;

  try {
    const stu = await sql<{ id: string; full_name: string }[]>`select id, full_name from crm_students where id = ${studentId} and archived_at is null`;
    if (!stu.length) return NextResponse.json({ error: 'O‘quvchi topilmadi' }, { status: 400 });

    const ok = await sql.begin(async (tx) => {
      // qaysi abonement/guruh
      let enrId: string | null = null;
      let groupName: string | null = null;
      if (body.groupId) {
        const [e] = await tx<{ id: string; name: string }[]>`
          select e.id, g.name from crm_enrollments e join crm_groups g on g.id = e.group_id
          where e.student_id = ${studentId} and e.group_id = ${body.groupId}
          order by (e.status = 'active') desc limit 1`;
        if (e) { enrId = e.id; groupName = e.name; }
      }
      // idem: xuddi shu kalit bilan to'lov bormi
      if (body.idemKey) {
        const dup = await tx`select 1 from crm_payments where idem_key = ${body.idemKey} limit 1`;
        if (dup.length) return false;
      }
      await tx`
        insert into crm_payments (student_id, enrollment_id, group_name, amount, method, paid_at, is_refund, refund_amount, idem_key, created_by)
        values (${studentId}, ${enrId}, ${groupName}, ${amount}, ${method}, ${paidAt}, ${isRefund}, ${isRefund ? amount : 0}, ${body.idemKey ?? null}, ${me.id})`;
      // balansni yangilash (satrni qulflab o'qib-yozish)
      await tx`
        update crm_students set balance = balance + ${isRefund ? -amount : amount}, updated_at = now()
        where id = ${studentId}`;
      return true;
    });

    if (!ok) return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] record payment failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}

// To'lovni o'chirish (xatoni tuzatish) — balansni teskari to'g'rilaydi.
export async function DELETE(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });
  let body: { paymentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }
  if (!body.paymentId) return NextResponse.json({ error: 'To‘lov majburiy' }, { status: 400 });

  try {
    const ok = await sql.begin(async (tx) => {
      const [p] = await tx<{ amount: number; is_refund: boolean; student_id: string | null }[]>`
        select amount, is_refund, student_id from crm_payments where id = ${body.paymentId!}`;
      if (!p) return false;
      await tx`delete from crm_payments where id = ${body.paymentId!}`;
      // Oddiy to'lov balansni +amount qilgandi → o'chirishda -amount; refund esa aksincha.
      if (p.student_id) {
        const delta = p.is_refund ? p.amount : -p.amount;
        await tx`update crm_students set balance = balance + ${delta}, updated_at = now() where id = ${p.student_id}`;
      }
      return true;
    });
    if (!ok) return NextResponse.json({ error: 'To‘lov topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] delete payment failed', e);
    return NextResponse.json({ error: 'O‘chirishda xatolik' }, { status: 500 });
  }
}
