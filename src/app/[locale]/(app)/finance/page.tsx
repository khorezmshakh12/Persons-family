import { getTranslations, getLocale } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { redirect, Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { MaskableStatValue } from '@/components/dashboard/maskable-stat-value';
import type { FinanceEntry } from '@/components/finance/finance-entries-list';

export const dynamic = 'force-dynamic';

function netTotal(entries: { amount: number }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

export default async function FinancePage() {
  const t = await getTranslations('finance');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo';
  const supabase = await createClient();

  if (isAdmin) {
    const [{ data: staff }, { data: entries }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('is_active', true)
        .order('first_name', { ascending: true }),
      supabase.from('finance_entries').select('*').order('created_at', { ascending: false }),
    ]);

    const entriesByStaffId = new Map<string, FinanceEntry[]>();
    for (const e of entries ?? []) {
      const list = entriesByStaffId.get(e.staff_id) ?? [];
      list.push(e);
      entriesByStaffId.set(e.staff_id, list);
    }

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {t('title')}
          </h1>
          <p className="text-white/70">{t('adminSubtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          {(staff ?? []).map((person, index) => {
            const personEntries = entriesByStaffId.get(person.id) ?? [];
            const net = netTotal(personEntries);
            return (
              <Link
                key={person.id}
                href={`/finance/${person.id}`}
                style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
                className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'animate-fade-in-up flex items-center justify-between gap-3 p-6')}
              >
                <span className="font-semibold text-white">
                  {person.first_name} {person.last_name}
                </span>
                <span className="text-lg font-bold tabular-nums">
                  <MaskableStatValue
                    value={`${net >= 0 ? '+' : ''}${formatUZS(net)}`}
                    valueClassName={net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-white/70'}
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Non-admin: their own ledger + KPI + Income Roadmap all live together on
  // the per-staff detail page now, so this list page just forwards them.
  const locale = await getLocale();
  redirect({ href: `/finance/${user!.id}`, locale });
}
