import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { AddDutyDialog } from './add-duty-dialog';
import { DutyRow } from './duty-row';

export async function DutiesCard({ staffId, canManage }: { staffId: string; canManage: boolean }) {
  const t = await getTranslations('profile.duties');

  const [duties, contracts] = await Promise.all([
    sql<
      { id: string; title: string; description: string | null; contract_id: string | null; contract_title: string | null }[]
    >`
      select d.id, d.title, d.description, d.contract_id, c.title as contract_title
      from staff_duties d
      left join staff_contracts c on c.id = d.contract_id
      where d.staff_id = ${staffId}
      order by d.created_at desc
    `,
    canManage
      ? sql<{ id: string; title: string }[]>`select id, title from staff_contracts where staff_id = ${staffId}`
      : Promise.resolve([]),
  ]);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        {canManage && <AddDutyDialog staffId={staffId} contracts={contracts} />}
      </div>
      {duties.length === 0 ? (
        <p className="text-sm text-white/60">{t('noDuties')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {duties.map((duty) => (
            <DutyRow
              key={duty.id}
              id={duty.id}
              title={duty.title}
              description={duty.description}
              contractTitle={duty.contract_title}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
