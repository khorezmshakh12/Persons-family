import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// CRM umumiy sozlamalari (singleton: id=true). Markaz nomi, to'lov sikli,
// kechikish chegarasi va valyutani saqlaydi. Finance hisob ustunlariga
// (income_acct/cash_acct) tegmaydi — ularni finance-config endpointi boshqaradi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { centerName?: string; cycleDays?: number | string; lateAfter?: number | string; currency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const cycleDays = Math.max(1, Math.round(Number(body.cycleDays) || 30));
  const lateAfter = Math.max(0, Math.round(Number(body.lateAfter) || 10));
  const currency = (body.currency ?? 'UZS').toString().trim().slice(0, 8) || 'UZS';
  const centerName = (body.centerName ?? '').toString().trim() || null;

  try {
    await sql`
      insert into crm_settings (id, center_name, cycle_days, late_after_minutes, currency, updated_by, updated_at)
      values (true, ${centerName}, ${cycleDays}, ${lateAfter}, ${currency}, ${me.id}, now())
      on conflict (id) do update set center_name = excluded.center_name, cycle_days = excluded.cycle_days, late_after_minutes = excluded.late_after_minutes, currency = excluded.currency, updated_by = excluded.updated_by, updated_at = now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] settings failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
