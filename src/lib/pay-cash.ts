import 'server-only';
import { sql } from '@/lib/db/client';

/** A kassa / bank / karta account money can leave from (acct_accounts.cash_box). */
export type CashBox = { code: string; name: string };

/** Payments made before payment methods existed left the bank account —
 * the same account the old "Ish haqi to‘landi" posting used. */
export const LEGACY_PAY_BOX = '5110';

export async function loadCashBoxes(): Promise<CashBox[]> {
  return [...(await sql<CashBox[]>`select code, name from acct_accounts where cash_box order by sort, code`)];
}

/** True when `code` is a cash box (a payment's method must be one). */
export async function isCashBox(code: string): Promise<boolean> {
  const [row] = await sql`select 1 from acct_accounts where code = ${code} and cash_box`;
  return !!row;
}

/**
 * Mirror one payroll month's payments (salary + advance) into the journal:
 * one row per payment, 6710 (mehnat haqi bo‘yicha qarz) → the cash box it
 * left from, dated the day it was paid. Re-run after every payment change;
 * it replaces the month's rows (and the old one-line "paid" posting) so it
 * can never double count. A closed accounting month refuses the write — the
 * payroll change still stands, so this only logs.
 */
export async function syncPayCash(...periods: (string | null | undefined)[]): Promise<void> {
  for (const period of new Set(periods.filter((p): p is string => !!p))) {
    try {
      await sql.begin(async (tx) => {
        const rows = await tx<{ id: string; amount: number; kind: string; method: string; day: string; first_name: string | null; last_name: string | null }[]>`
          select fe.id, fe.amount, fe.kind::text as kind, coalesce(fe.method, ${LEGACY_PAY_BOX}) as method,
            to_char(fe.created_at at time zone 'Asia/Tashkent', 'YYYY-MM-DD') as day, p.first_name, p.last_name
          from finance_entries fe join profiles p on p.id = fe.staff_id
          where fe.period = ${period} and fe.kind in ('salary', 'advance') and fe.amount > 0`;
        await tx`
          delete from acct_entries
          where source like ${`pay:${period}:%`} or source = ${`payroll:${period.slice(0, 7)}:paid`}`;
        if (rows.length)
          await tx`
            insert into acct_entries ${tx(
              rows.map((r) => ({
                entry_date: r.day,
                doc: 'AUTO',
                description: `${r.kind === 'advance' ? 'Avans' : 'Oylik'} — ${`${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Xodim'}`.slice(0, 300),
                debit: '6710',
                credit: r.method,
                amount: r.amount,
                source: `pay:${period}:${r.id}`,
              })),
            )}`;
      });
    } catch (error) {
      console.error('syncPayCash failed', period, error instanceof Error ? error.message : error);
    }
  }
}
