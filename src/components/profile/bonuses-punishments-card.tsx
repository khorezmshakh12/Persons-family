import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import {
  PerformanceEntriesList,
  type PerformanceEntry,
} from '@/components/performance/performance-entries-list';
import { AddPerformanceEntryDialog } from './add-performance-entry-dialog';

export async function BonusesPunishmentsCard({
  staffId,
  canManage,
}: {
  staffId: string;
  canManage: boolean;
}) {
  const t = await getTranslations('profile.bonusesPunishments');
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from('performance_entries')
    .select('id, entry_type, amount, reason, created_at, warning:staff_warnings(reason)')
    .eq('staff_id', staffId)
    .order('created_at', { ascending: false });

  const rows = (entries ?? []).map((e) => ({ ...e, warningReason: e.warning?.reason ?? null }));
  const bonuses: PerformanceEntry[] = rows.filter((e) => e.entry_type === 'bonus');
  const punishments: PerformanceEntry[] = rows.filter((e) => e.entry_type === 'penalty');

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <AddPerformanceEntryDialog staffId={staffId} />}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-white/80">{t('bonusesTitle')}</h3>
        <PerformanceEntriesList entries={bonuses} isAdmin={canManage} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium text-white/80">{t('punishmentsTitle')}</h3>
        <PerformanceEntriesList entries={punishments} isAdmin={canManage} />
      </div>
    </div>
  );
}
