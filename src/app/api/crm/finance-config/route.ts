import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// CRM → Finance ulanishi: kirim (type R) va kassa/bank (type A) hisoblarini
// saqlaydi. Faqat sozlama — daftarga (acct_entries) yozmaydi. Kodlar hisob
// rejasida (acct_accounts) mavjudligi tekshiriladi.
export async function POST(req: Request) {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  let body: { incomeAcct?: string; cashAcct?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Noto‘g‘ri so‘rov' }, { status: 400 });
  }

  const income = body.incomeAcct?.trim() || null;
  const cash = body.cashAcct?.trim() || null;

  try {
    if (income) {
      const [r] = await sql`select 1 from acct_accounts where code = ${income} and type = 'R'`;
      if (!r) return NextResponse.json({ error: 'Kirim hisobi topilmadi (type R bo‘lishi kerak)' }, { status: 400 });
    }
    if (cash) {
      const [a] = await sql`select 1 from acct_accounts where code = ${cash} and type = 'A'`;
      if (!a) return NextResponse.json({ error: 'Kassa/bank hisobi topilmadi (type A bo‘lishi kerak)' }, { status: 400 });
    }
    await sql`
      insert into crm_settings (id, income_acct, cash_acct, updated_by, updated_at)
      values (true, ${income}, ${cash}, ${me.id}, now())
      on conflict (id) do update set income_acct = excluded.income_acct, cash_acct = excluded.cash_acct, updated_by = excluded.updated_by, updated_at = now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[crm] finance config failed', e);
    return NextResponse.json({ error: 'Saqlashda xatolik' }, { status: 500 });
  }
}
