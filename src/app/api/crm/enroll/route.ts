import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Mavjud o'quvchini guruhga qo'shish (abonement/enrollment yaratish).
// Agar tarif > 0 bo'lsa, shu sikl uchun charge ochiladi va o'quvchi balansi
// o'sha summaga kamayadi (qarz). Bir o'quvchi bitta guruhda faqat bitta
// yakunlanmagan abonementga ega bo'lishi mumkin.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { studentId?: string; groupId?: string; tariff?: number | string; activationDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const studentId = body.studentId ?? '';
  const groupId = body.groupId ?? '';
  const activation = (body.activationDate ?? '').slice(0, 10);
  if (!studentId || !groupId || !/^\d{4}-\d{2}-\d{2}$/.test(activation)) {
    return NextResponse.json({ error: 'O‘quvchi, guruh va faollashtirish sanasi majburiy' }, { status: 400 });
  }
  const tariff = Number(body.tariff) || 0;

  try {
    const result = await sql.begin(async (tx) => {
      const dup = await tx`select 1 from crm_enrollments where student_id = ${studentId} and group_id = ${groupId} and status <> 'finished'`;
      if (dup.length) return 'dup';

      const [enr] = await tx<{ id: string }[]>`
        insert into crm_enrollments (student_id, group_id, tariff_amount, activation_date, status, created_by)
        values (${studentId}, ${groupId}, ${tariff}, ${activation}, 'active', ${me.id})
        returning id`;

      if (tariff > 0) {
        await tx`
          insert into crm_charges (enrollment_id, period_start, period_end, amount, due_date, status)
          values (${enr.id}, ${activation}, (${activation}::date + 30), ${tariff}, ${activation}, 'pending')`;
        await tx`update crm_students set balance = balance - ${tariff}, updated_at = now() where id = ${studentId}`;
      }
      return enr.id;
    });

    if (result === 'dup') return NextResponse.json({ error: 'O‘quvchi allaqachon shu guruhda' }, { status: 400 });
    return NextResponse.json({ ok: true, id: result });
  } catch (e) {
    console.error('[crm] enroll failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
