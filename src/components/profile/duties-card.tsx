import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { AddDutyDialog } from './add-duty-dialog';
import { DutyRow } from './duty-row';

export async function DutiesCard({ staffId, canManage }: { staffId: string; canManage: boolean }) {
  const t = await getTranslations('profile.duties');
  const supabase = await createClient();

  const [{ data: duties }, { data: contracts }] = await Promise.all([
    supabase
      .from('staff_duties')
      .select('id, title, description, contract_id, contract:staff_contracts(title)')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false }),
    canManage
      ? supabase.from('staff_contracts').select('id, title').eq('staff_id', staffId)
      : Promise.resolve({ data: null }),
  ]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <AddDutyDialog staffId={staffId} contracts={contracts ?? []} />}
      </div>
      {!duties || duties.length === 0 ? (
        <p className="text-sm text-white/60">{t('noDuties')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {duties.map((duty) => (
            <DutyRow
              key={duty.id}
              id={duty.id}
              title={duty.title}
              description={duty.description}
              contractTitle={duty.contract?.title ?? null}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
