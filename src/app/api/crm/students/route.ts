import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Yangi o'quvchi qo'shish: o'quvchi + aloqa (tel/ota-ona) + abonement
// (faollashtirish sanasi bilan) + shu sikl uchun charge, va ixtiyoriy
// birinchi to'lov — hammasi bitta tranzaksiyada. Balans = to'lov − charge
// (manfiy = qarz) shu yerda yuritiladi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    name?: string; tel?: string; ptel?: string; sex?: string; birthday?: string;
    groupId?: string; tariff?: number | string; activationDate?: string;
    payMethod?: string; payAmount?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const groupId = body.groupId ?? '';
  const activation = (body.activationDate ?? '').slice(0, 10);
  if (!name || !groupId || !/^\d{4}-\d{2}-\d{2}$/.test(activation)) {
    return NextResponse.json({ error: 'F.I.O, guruh va to‘g‘ri faollashtirish sanasi majburiy' }, { status: 400 });
  }
  const tariff = Number(body.tariff) || 0;
  const payAmount = Number(body.payAmount) || 0;
  const method = ['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other'].includes(body.payMethod ?? '')
    ? body.payMethod!
    : 'cash';
  const sex = body.sex === 'm' || body.sex === 'w' ? body.sex : null;
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(body.birthday ?? '') ? body.birthday! : null;

  try {
    const grp = await sql<{ id: string; name: string }[]>`select id, name from crm_groups where id = ${groupId} and archived_at is null`;
    if (!grp.length) return NextResponse.json({ error: 'Guruh topilmadi' }, { status: 400 });

    const studentId = await sql.begin(async (tx) => {
      const balance = payAmount - tariff; // charge (-tariff) + to'lov (+payAmount)
      const [s] = await tx<{ id: string }[]>`
        insert into crm_students (full_name, sex, birthday, balance, created_by)
        values (${name}, ${sex}, ${birthday}, ${balance}, ${me.id})
        returning id`;
      if (body.tel) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${s.id}, 'student', ${body.tel}, true)`;
      if (body.ptel) await tx`insert into crm_contacts (student_id, kind, phone) values (${s.id}, 'guardian', ${body.ptel})`;

      const [enr] = await tx<{ id: string }[]>`
        insert into crm_enrollments (student_id, group_id, tariff_amount, activation_date, status, created_by)
        values (${s.id}, ${groupId}, ${tariff}, ${activation}, 'active', ${me.id})
        returning id`;

      // shu sikl uchun charge (nima qarz)
      if (tariff > 0) {
        await tx`
          insert into crm_charges (enrollment_id, period_start, period_end, amount, due_date, status)
          values (${enr.id}, ${activation}, (${activation}::date + 30), ${tariff}, ${activation},
                  ${payAmount >= tariff ? 'paid' : payAmount > 0 ? 'partial' : 'pending'})`;
      }
      // ixtiyoriy birinchi to'lov
      if (payAmount > 0) {
        await tx`
          insert into crm_payments (student_id, enrollment_id, group_name, amount, method, paid_at, created_by)
          values (${s.id}, ${enr.id}, ${grp[0].name}, ${payAmount}, ${method}, ${activation}, ${me.id})`;
      }
      return s.id;
    });

    return NextResponse.json({ ok: true, id: studentId });
  } catch (e) {
    console.error('[crm] create student failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
