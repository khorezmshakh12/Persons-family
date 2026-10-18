import { sql } from '@/lib/db/client';
import { tashkentMonthKey } from '@/lib/time';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

const fmt = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));

/** Operations HQ ↔ CRM: real, jonli raqamlar to'g'ridan-to'g'ri CRM (crm_*)
 * jadvallaridan — ops_leads emas. "Aniq raqamlar chiqishi" (10-band). */
export async function OpsCrmSummary() {
  const month = tashkentMonthKey();
  const [students, leads, revenue, groups] = await Promise.all([
    sql<{ c: number }[]>`select count(*)::int as c from crm_students where archived_at is null`.catch(() => [{ c: 0 }]),
    sql<{ c: number }[]>`select count(*)::int as c from crm_leads where to_char(created_at at time zone 'Asia/Tashkent', 'YYYY-MM') = ${month}`.catch(() => [{ c: 0 }]),
    sql<{ v: number }[]>`select coalesce(sum(case when is_refund then -amount else amount end), 0)::numeric as v from crm_payments where to_char(paid_at at time zone 'Asia/Tashkent', 'YYYY-MM') = ${month}`.catch(() => [{ v: 0 }]),
    sql<{ c: number }[]>`select count(*)::int as c from crm_groups where archived_at is null`.catch(() => [{ c: 0 }]),
  ]);
  const stat = (label: string, value: string, sub?: string) => (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-0.5 p-4')}>
      <span className="text-xs font-semibold text-au-muted">{label}</span>
      <span className="text-2xl font-bold tracking-tight text-au-ink">{value}</span>
      {sub && <span className="text-xs text-au-muted">{sub}</span>}
    </div>
  );
  return (
    <section className="flex flex-col gap-2" aria-label="CRM jonli raqamlar">
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-full bg-au-accent" />
        <h2 className="text-sm font-bold text-au-ink">CRM · jonli raqamlar</h2>
        <span className="text-xs text-au-muted">to‘g‘ridan-to‘g‘ri CRM bazasidan</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stat('Faol o‘quvchilar', fmt(students[0]?.c ?? 0))}
        {stat('Guruhlar', fmt(groups[0]?.c ?? 0))}
        {stat('Yangi lidlar (oy)', fmt(leads[0]?.c ?? 0))}
        {stat('Tushum (oy)', `${fmt(revenue[0]?.v ?? 0)} so‘m`)}
      </div>
    </section>
  );
}
