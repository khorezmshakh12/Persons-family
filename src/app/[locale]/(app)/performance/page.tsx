import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { ManageStaffPerformanceDialog } from '@/components/performance/manage-staff-performance-dialog';
import { PerformanceEntriesList, type PerformanceEntry } from '@/components/performance/performance-entries-list';
import { ExportButtons } from '@/components/export/export-buttons';

export const dynamic = 'force-dynamic';

function netTotal(entries: { entry_type: string; amount: number }[]) {
  return entries.reduce((sum, e) => sum + (e.entry_type === 'bonus' ? e.amount : -e.amount), 0);
}

export default async function PerformancePage() {
  const t = await getTranslations('performance');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  const supabase = await createClient();

  if (isAdmin) {
    const [{ data: staff }, { data: performance }, { data: entries }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('is_active', true)
        .order('first_name', { ascending: true }),
      supabase.from('staff_performance').select('*'),
      supabase.from('performance_entries').select('*').order('created_at', { ascending: false }),
    ]);

    const performanceByStaffId = new Map((performance ?? []).map((p) => [p.staff_id, p]));
    const entriesByStaffId = new Map<string, PerformanceEntry[]>();
    for (const e of entries ?? []) {
      const list = entriesByStaffId.get(e.staff_id) ?? [];
      list.push(e);
      entriesByStaffId.set(e.staff_id, list);
    }

    const exportRows = (staff ?? []).map((person) => {
      const perf = performanceByStaffId.get(person.id);
      const net = netTotal(entriesByStaffId.get(person.id) ?? []);
      return {
        name: `${person.first_name} ${person.last_name}`,
        role: person.role,
        tier: perf?.current_tier ?? '',
        weekly_progress_score: perf?.weekly_progress_score ?? '',
        net_total: net,
      };
    });

    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
              {t('title')}
            </h1>
            <p className="text-white/70">{t('adminSubtitle')}</p>
          </div>
          <ExportButtons
            filename="staff-performance"
            columns={[
              { header: 'Name', key: 'name' },
              { header: 'Role', key: 'role' },
              { header: 'Tier', key: 'tier' },
              { header: 'Weekly Progress %', key: 'weekly_progress_score' },
              { header: 'Net Total', key: 'net_total' },
            ]}
            rows={exportRows}
          />
        </div>

        <div className="flex flex-col gap-4">
          {(staff ?? []).map((person) => {
            const perf = performanceByStaffId.get(person.id) ?? null;
            const personEntries = entriesByStaffId.get(person.id) ?? [];
            const net = netTotal(personEntries);
            return (
              <div key={person.id} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">
                      {person.first_name} {person.last_name}
                    </span>
                    {perf && (
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
                        {t(`tierLabels.${perf.current_tier}`)} · {perf.weekly_progress_score}%
                      </span>
                    )}
                  </div>
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
                <ManageStaffPerformanceDialog staffId={person.id} performance={perf} />
                <PerformanceEntriesList entries={personEntries} isAdmin />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const [{ data: performance }, { data: entries }] = await Promise.all([
    supabase.from('staff_performance').select('*').eq('staff_id', user!.id).maybeSingle(),
    supabase
      .from('performance_entries')
      .select('*')
      .eq('staff_id', user!.id)
      .order('created_at', { ascending: false }),
  ]);

  const totalBonus = (entries ?? [])
    .filter((e) => e.entry_type === 'bonus')
    .reduce((sum, e) => sum + e.amount, 0);
  const totalPenalty = (entries ?? [])
    .filter((e) => e.entry_type === 'penalty')
    .reduce((sum, e) => sum + e.amount, 0);
  const net = totalBonus - totalPenalty;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      {performance && (
        <div className={cn(GLASS_CARD, 'flex flex-wrap items-center gap-3 p-6')}>
          <span className="rounded-full border border-teal-300/30 bg-teal-400/15 px-4 py-1.5 text-sm font-bold text-white">
            {t('tier')}: {t(`tierLabels.${performance.current_tier}`)}
          </span>
          <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium text-white">
            {t('weeklyProgressScore')}: {performance.weekly_progress_score}%
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{t('totalBonus')}</span>
          <span className="text-2xl font-bold tabular-nums text-emerald-400">+{formatUZS(totalBonus)}</span>
        </div>
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{t('totalPenalty')}</span>
          <span className="text-2xl font-bold tabular-nums text-red-400">-{formatUZS(totalPenalty)}</span>
        </div>
        <div className={cn(GLASS_CARD, 'flex flex-col gap-1 p-6')}>
          <span className="text-sm text-white/60">{t('netTotal')}</span>
          <span
            className={cn('text-2xl font-bold tabular-nums', net >= 0 ? 'text-emerald-400' : 'text-red-400')}
          >
            {net >= 0 ? '+' : ''}
            {formatUZS(net)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('history')}</h2>
        <PerformanceEntriesList entries={(entries ?? []) as PerformanceEntry[]} isAdmin={false} />
      </div>
    </div>
  );
}
