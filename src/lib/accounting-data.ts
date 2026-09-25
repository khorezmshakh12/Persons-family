import 'server-only';
import { sql } from '@/lib/db/client';
import { DEFAULT_TAX, type Account, type Asset, type Course, type Entry, type TaxSettings } from '@/lib/accounting';

export type Books = {
  accounts: Account[];
  opening: Record<string, number>;
  entries: Entry[];
  assets: Asset[];
  courses: Course[];
  tax: TaxSettings;
  budget: { period: string; code: string; amount: number }[];
  /** Planned head-count per month ('YYYY-MM' → students) for the flexible budget. */
  planStudents: Record<string, number>;
};

/** Everything Hisob-kitob and the Strategy Moliya/Tahlil tabs compute from. */
export async function loadBooks(): Promise<Books> {
  const [accounts, opening, entries, assets, courses, tax, budget, plan] = await Promise.all([
    sql<Account[]>`select code, name, type from acct_accounts order by sort, code`,
    sql<{ code: string; amount: number }[]>`select code, amount from acct_opening`,
    sql<Entry[]>`
      select id, entry_date, doc, description, debit, credit, amount, source
      from acct_entries order by entry_date, created_at`,
    sql<Asset[]>`select id, name, category, cost, acquired, life_years, disposed from acct_assets order by acquired`,
    sql<Course[]>`select id, name, fee, students, teacher_cost, book_cost, teacher_share::float8 as teacher_share, hours_month::float8 as hours_month from acct_courses order by sort_order, name`,
    sql<{ value: Partial<TaxSettings> }[]>`select value from acct_settings where key = 'tax'`,
    sql<{ period: string; code: string; amount: number }[]>`select period, code, amount from acct_budget`,
    sql<{ value: Record<string, number> }[]>`select value from acct_settings where key = 'plan_students'`,
  ]);
  return {
    accounts: [...accounts],
    opening: Object.fromEntries(opening.map((o) => [o.code, o.amount])),
    entries: [...entries],
    assets: [...assets],
    courses: [...courses],
    tax: { ...DEFAULT_TAX, ...(tax[0]?.value ?? {}) },
    budget: budget.map((b) => ({ ...b, period: b.period.slice(0, 7) })),
    planStudents: plan[0]?.value ?? {},
  };
}
