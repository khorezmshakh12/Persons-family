'use client';

import { useTranslations } from 'next-intl';
import { MARKET_CATEGORIES, type MarketCategory } from '@/lib/market';
import { Label } from '@/components/ui/label';

/** Category picker shared by the create and edit item dialogs. */
export function CategorySelect({ id, defaultValue = 'gift' }: { id: string; defaultValue?: MarketCategory }) {
  const t = useTranslations('market');
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t('admin.category')}</Label>
      <select
        id={id}
        name="category"
        defaultValue={defaultValue}
        className="h-9 rounded-md border border-au-line bg-au-card px-3 text-sm text-au-ink focus:outline-none"
      >
        {MARKET_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {t(`categories.${c}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
