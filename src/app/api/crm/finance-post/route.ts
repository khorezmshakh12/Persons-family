import { NextResponse } from 'next/server';
import { sql } from '@/lib/db/client';
import { crmUser } from '../guard';

export const dynamic = 'force-dynamic';

// CRM pul harakatini Finance daftariga (acct_entries) o'tkazadi — endi faqat
// to'lov emas, XARAJAT/OYLIK/MARKETING ham (oldin faqat to'lov o'tardi →
// daftar CRM daromadini ko'rib, xarajatini ko'rmas, foyda oshib ketardi).
//
// To'lov: Dt kassa / Kt kirim (qaytarish aksincha). Xarajat/oylik: Dt 9420
// (ma'muriy) / Kt kassa. Marketing: Dt 9410 (sotuv) / Kt kassa.
// source UNIQUE (crm-pay/exp/sal/mkt:<id>) → qayta o'tkazilsa dublikat yo'q.
// paid_at/spent_at — `date` ustunlari (biznes kuni), shuning uchun entry_date'ga
// to'g'ridan-to'g'ri yoziladi; oylik yozuv sanasi = period oyining 1-kuni.
// Yopiq oy DB triggeri (period_closed) yozuvni rad etadi — har biri alohida
// try/catch'da, qolganlarini to'xtatmaydi.
const ACC = { expense: '9420', salary: '9420', marketing: '9410' };

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
    const codes = [...new Set(Object.values(ACC))];
    const have = new Set((await sql<{ code: string }[]>`select code from acct_accounts where code = any(${codes})`).map((r) => r.code));

    let posted = 0, locked = 0, failed = 0;
    const put = async (entryDate: string, desc: string, debit: string, credit: string, amount: number, source: string) => {
      try {
        await sql`
          insert into acct_entries (entry_date, doc, description, debit, credit, amount, source, created_by)
          values (${entryDate}, '', ${desc.slice(0, 300)}, ${debit}, ${credit}, ${amount}, ${source}, ${me.id})
          on conflict (source) do nothing`;
        posted++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/period_closed|closed|yopiq/i.test(msg)) locked++;
        else {
          failed++;
          console.error('[crm] finance-post row failed', source, err);
        }
      }
    };

    // To'lovlar → Dt kassa / Kt kirim (qaytarish aksincha), Tashkent sanasi.
    const pays = await sql<{ id: string; paid_at: string; amount: number; is_refund: boolean; sn: string | null }[]>`
      select p.id, p.paid_at, p.amount, p.is_refund, s.full_name as sn
      from crm_payments p left join crm_students s on s.id = p.student_id
      where p.amount > 0 and not exists (select 1 from acct_entries e where e.source = 'crm-pay:' || p.id::text)
      order by p.paid_at`;
    for (const p of pays) {
      await put(
        p.paid_at,
        `CRM${p.is_refund ? ' (qaytarish)' : ''}: ${p.sn ?? 'to‘lov'}`,
        p.is_refund ? income : cash,
        p.is_refund ? cash : income,
        p.amount,
        `crm-pay:${p.id}`,
      );
    }

    // Xarajatlar → Dt 9420 (ma'muriy) / Kt kassa.
    if (have.has(ACC.expense)) {
      const rows = await sql<{ id: string; spent_at: string; amount: number; category: string | null }[]>`
        select id, spent_at, amount, category from crm_expenses
        where amount > 0 and not exists (select 1 from acct_entries e where e.source = 'crm-exp:' || id::text)`;
      for (const r of rows) await put(r.spent_at, `CRM xarajat: ${r.category ?? '—'}`, ACC.expense, cash, r.amount, `crm-exp:${r.id}`);
    }

    // Oyliklar → Dt 9420 (ma'muriy) / Kt kassa. entry_date = oyning 1-kuni.
    if (have.has(ACC.salary)) {
      const rows = await sql<{ id: string; period: string; amount: number; name: string }[]>`
        select id, period, amount, name from crm_salaries
        where amount > 0 and not exists (select 1 from acct_entries e where e.source = 'crm-sal:' || id::text)`;
      for (const r of rows) await put(`${String(r.period).slice(0, 7)}-01`, `CRM oylik: ${r.name}`, ACC.salary, cash, r.amount, `crm-sal:${r.id}`);
    }

    // Marketing → Dt 9410 (sotuv/reklama) / Kt kassa.
    if (have.has(ACC.marketing)) {
      const rows = await sql<{ id: string; spent_at: string; amount: number; channel: string | null }[]>`
        select id, spent_at, amount, channel from crm_marketing_spend
        where amount > 0 and not exists (select 1 from acct_entries e where e.source = 'crm-mkt:' || id::text)`;
      for (const r of rows) await put(r.spent_at, `CRM marketing: ${r.channel ?? '—'}`, ACC.marketing, cash, r.amount, `crm-mkt:${r.id}`);
    }

    return NextResponse.json({ ok: true, posted, locked, failed, total: pays.length });
  } catch (e) {
    console.error('[crm] finance-post failed', e);
    return NextResponse.json({ error: 'O‘tkazishda xatolik' }, { status: 500 });
  }
}
