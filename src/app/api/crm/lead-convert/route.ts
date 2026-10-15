import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// Lidni o'quvchiga aylantirish: liddan o'quvchi yaratadi, ixtiyoriy guruhga
// abonement (+ charge + birinchi to'lov) qo'shadi, lidni 'won' deb belgilaydi
// va converted_student_id ni bog'laydi. Hammasi bitta tranzaksiyada.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: {
    leadId?: string; name?: string; tel?: string; ptel?: string;
    groupId?: string; tariff?: number | string; activationDate?: string;
    payMethod?: string; payAmount?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const leadId = body.leadId ?? '';
  const name = (body.name ?? '').trim();
  if (!leadId || !name) return NextResponse.json({ error: 'Lid va F.I.O majburiy' }, { status: 400 });
  const groupId = body.groupId || null;
  const activation = (body.activationDate ?? '').slice(0, 10);
  const hasGroup = !!groupId;
  if (hasGroup && !/^\d{4}-\d{2}-\d{2}$/.test(activation)) {
    return NextResponse.json({ error: 'Guruh tanlansa, faollashtirish sanasi majburiy' }, { status: 400 });
  }
  const tariff = Number(body.tariff) || 0;
  const payAmount = Number(body.payAmount) || 0;
  const method = ['cash', 'card', 'online', 'click', 'payme', 'uzum', 'transfer', 'other'].includes(body.payMethod ?? '') ? body.payMethod! : 'cash';

  try {
    const lead = await sql<{ id: string; converted_student_id: string | null }[]>`select id, converted_student_id from crm_leads where id = ${leadId}`;
    if (!lead.length) return NextResponse.json({ error: 'Lid topilmadi' }, { status: 400 });
    if (lead[0].converted_student_id) return NextResponse.json({ error: 'Bu lid allaqachon o‘quvchiga aylantirilgan' }, { status: 409 });

    const studentId = await sql.begin(async (tx) => {
      const balance = hasGroup ? payAmount - tariff : 0;
      const [s] = await tx<{ id: string }[]>`
        insert into crm_students (full_name, balance, created_by) values (${name}, ${balance}, ${me.id}) returning id`;
      if (body.tel) await tx`insert into crm_contacts (student_id, kind, phone, is_primary) values (${s.id}, 'student', ${body.tel}, true)`;
      if (body.ptel) await tx`insert into crm_contacts (student_id, kind, phone) values (${s.id}, 'guardian', ${body.ptel})`;

      if (hasGroup) {
        const grp = await tx<{ name: string }[]>`select name from crm_groups where id = ${groupId}`;
        const [enr] = await tx<{ id: string }[]>`
          insert into crm_enrollments (student_id, group_id, tariff_amount, activation_date, status, created_by)
          values (${s.id}, ${groupId}, ${tariff}, ${activation}, 'active', ${me.id}) returning id`;
        if (tariff > 0) {
          await tx`insert into crm_charges (enrollment_id, period_start, period_end, amount, due_date, status)
                   values (${enr.id}, ${activation}, (${activation}::date + 30), ${tariff}, ${activation}, ${payAmount >= tariff ? 'paid' : payAmount > 0 ? 'partial' : 'pending'})`;
        }
        if (payAmount > 0) {
          await tx`insert into crm_payments (student_id, enrollment_id, group_name, amount, method, paid_at, created_by)
                   values (${s.id}, ${enr.id}, ${grp[0]?.name ?? null}, ${payAmount}, ${method}, ${activation}, ${me.id})`;
        }
      }

      await tx`update crm_leads set status = 'won', converted_student_id = ${s.id}, updated_at = now() where id = ${leadId}`;
      return s.id;
    });

    return NextResponse.json({ ok: true, id: studentId });
  } catch (e) {
    console.error('[crm] lead convert failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
