import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

const ALLOWED = ['active', 'frozen', 'left', 'finished'];

// Abonement holatini o'zgartirish (muzlatish / faollashtirish). Guruh bo'yicha
// faol (yoki eng so'nggi) abonement topiladi. Guarded: joriy holat boshqa
// bo'lsagina yoziladi (ikki marta bosish yoki poyga holatini oldini oladi),
// va holat tarixiga yoziladi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { studentId?: string; groupId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const { studentId, groupId, status } = body;
  if (!studentId || !groupId || !status || !ALLOWED.includes(status)) {
    return NextResponse.json({ error: 'O‘quvchi, guruh va to‘g‘ri holat majburiy' }, { status: 400 });
  }

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

  try {
    const changed = await sql.begin(async (tx) => {
      const [enr] = await tx<{ id: string; status: string }[]>`
        select id, status from crm_enrollments
        where student_id = ${studentId} and group_id = ${groupId}
        order by (status <> 'finished') desc, created_at desc limit 1`;
      if (!enr) return null;
      if (enr.status === status) return { id: enr.id, noop: true };

      const res = await tx`
        update crm_enrollments set status = ${status}, updated_at = now()
        where id = ${enr.id} and status = ${enr.status}`;
      if (res.count === 0) return { id: enr.id, noop: true }; // boshqa birov o'zgartirdi

      await tx`
        insert into crm_enrollment_status_history (enrollment_id, from_status, to_status, effective_date, created_by)
        values (${enr.id}, ${enr.status}, ${status}, ${today}, ${me.id})`;
      return { id: enr.id, noop: false };
    });

    if (!changed) return NextResponse.json({ error: 'Abonement topilmadi' }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] enrollment status failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
