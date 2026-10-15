import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// CRM to'lovlarini Finance daftariga (acct_entries) o'tkazadi.
// Har to'lov: debit = kassa, kredit = kirim (qaytarish esa aksincha), amount>0.
// source = crm-pay:<id> (UNIQUE) → qayta o'tkazilsa dublikat bo'lmaydi.
// Yopilgan oy DB triggeri (period_closed) yozuvni rad etadi — har biri alohida
// try/catch'da, shuning uchun bitta yopiq oy qolganlarini to'xtatmaydi.
export async function POST() {
  const me = await crmUser();
  if (!me) return NextResponse.json({ error: 'Ruxsat yo‘q' }, { status: 401 });

  try {
    const [cfg] = await sql<{ income_acct: string | null; cash_acct: string | null }[]>`
      select income_acct, cash_acct from crm_settings where id = true`;
    const income = cfg?.income_acct;
    const cash = cfg?.cash_acct;
    if (!income || !cash) {
      return NextResponse.json({ error: 'Avval «Persons ulanishi»da kirim va kassa hisoblarini sozlang' }, { status: 400 });
    }

    const pays = await sql<{ id: string; paid_at: string; amount: number; is_refund: boolean; sn: string | null }[]>`
      select p.id, p.paid_at, p.amount, p.is_refund, s.full_name as sn
      from crm_payments p left join crm_students s on s.id = p.student_id
      where p.amount > 0
        and not exists (select 1 from acct_entries e where e.source = ${'crm-pay:'} || p.id::text)
      order by p.paid_at`;

    let posted = 0, locked = 0, failed = 0;
    for (const p of pays) {
      const debit = p.is_refund ? income : cash;
      const credit = p.is_refund ? cash : income;
      const desc = `CRM${p.is_refund ? ' (qaytarish)' : ''}: ${p.sn ?? 'to‘lov'}`.slice(0, 300);
      try {
        await sql`
          insert into acct_entries (entry_date, doc, description, debit, credit, amount, source, created_by)
          values (${p.paid_at}, '', ${desc}, ${debit}, ${credit}, ${p.amount}, ${`crm-pay:${p.id}`}, ${me.id})
          on conflict (source) do nothing`;
        posted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/period_closed|closed|yopiq/i.test(msg)) locked++;
        else {
          failed++;
          console.error('[crm] finance-post row failed', p.id, err);
        }
      }
    }

    return NextResponse.json({ ok: true, posted, locked, failed, total: pays.length });
  } catch (e) {
    console.error('[crm] finance-post failed', e);
    return NextResponse.json({ error: 'O‘tkazishda xatolik' }, { status: 500 });
  }
}
