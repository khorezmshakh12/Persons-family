import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { ManageStaffFinanceDialog } from '@/components/finance/manage-staff-finance-dialog';
import { FinanceEntriesList, type FinanceEntry } from '@/components/finance/finance-entries-list';

export const dynamic = 'force-dynamic';

function netTotal(entries: { amount: number }[]) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

export default async function FinancePage() {
  const t = await getTranslations('finance');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'it_developer';
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
          {(staff ?? []).map((person) => {
            const personEntries = entriesByStaffId.get(person.id) ?? [];
            const net = netTotal(personEntries);
            return (
              <div key={person.id} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold text-white">
                    {person.first_name} {person.last_name}
                  </span>
                  <span
                    className={cn(
                      'text-lg font-bold tabular-nums',
                      net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-white/70',
                    )}
                  >
                    {net >= 0 ? '+' : ''}
                    {formatUZS(net)}
                  </span>
                </div>
                <ManageStaffFinanceDialog staffId={person.id} />
                <FinanceEntriesList entries={personEntries} isAdmin />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const { data: entries } = await supabase
    .from('finance_entries')
    .select('*')
    .eq('staff_id', user!.id)
    .order('created_at', { ascending: false });

  const net = netTotal(entries ?? []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
        <span className="text-sm text-white/60">{t('netTotal')}</span>
        <span className={cn('text-2xl font-bold tabular-nums', net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {net >= 0 ? '+' : ''}
          {formatUZS(net)}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('history')}
        </h2>
        <FinanceEntriesList entries={(entries ?? []) as FinanceEntry[]} isAdmin={false} />
      </div>
    </div>
  );
}
