'use client';

import { useTranslations } from 'next-intl';
import { Compass } from 'lucide-react';
import { UpsertRoadmapDialog } from './upsert-roadmap-dialog';

export function EmptyRoadmapState({
  canManage,
  staffId,
  year,
}: {
  canManage: boolean;
  staffId: string;
  year: number;
}) {
  const t = useTranslations('incomeRoadmap');

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-white/20 bg-white/5 text-white/60 shadow-lg backdrop-blur-md">
        <Compass className="size-7" />
      </div>
      <div className="flex flex-col gap-1 max-w-sm">
        <h3 className="text-base font-semibold text-white">
          {canManage ? t('noPlan') : t('noPlanSelf')}
        </h3>
        <p className="text-xs text-white/50">{t('subtitle')}</p>
      </div>
      {canManage && (
        <div className="mt-2">
          <UpsertRoadmapDialog staffId={staffId} year={year} />
        </div>
      )}
    </div>
  );
}
