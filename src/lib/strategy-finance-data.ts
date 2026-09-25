import 'server-only';
import { sql } from '@/lib/db/client';
import { DEFAULT_FIN, type Debtor, type FinInputs, type FinMonth, type FinSettings } from '@/lib/strategy-finance';

/** Head-count inputs for Strategiya → Moliya / Tahlil (the money itself comes
 * from the Hisob-kitob ledger via loadBooks). */
export async function loadFinInputs(): Promise<FinInputs> {
  const [settings, months, debtors, enrolled] = await Promise.all([
    sql<{ value: Partial<FinSettings> }[]>`select value from acct_settings where key = 'strategy_fin'`,
    sql<FinMonth[]>`select ym, students, paid, new_students, capacity from strategy_fin_months order by ym`,
    sql<Debtor[]>`
      select id, name, phone, course_id, grp, amount, due_date
      from strategy_debtors order by due_date, created_at`,
    sql<{ ym: string; n: number }[]>`
      select to_char(enrolled_at at time zone 'Asia/Tashkent', 'YYYY-MM') as ym, count(*)::int as n
      from ops_leads where enrolled_at is not null group by 1`,
  ]);
  return {
    settings: { ...DEFAULT_FIN, ...(settings[0]?.value ?? {}) },
    months: [...months],
    debtors: [...debtors],
    enrolled: Object.fromEntries(enrolled.map((r) => [r.ym, r.n])),
  };
}
