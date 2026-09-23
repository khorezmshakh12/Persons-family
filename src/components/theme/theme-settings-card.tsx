import { getTranslations } from 'next-intl/server';
import { Check } from 'lucide-react';
import { CHIP_NEUTRAL, CHIP_OK, SURFACE_INSET } from '@/lib/glass';
import { cn } from '@/lib/utils';

/**
 * Settings › Theme. Replaces the old wallpaper / blur pickers: Aurora is the
 * one light theme today; Dark is listed (disabled) so the slot is visible
 * before it ships.
 */
export async function ThemeSettingsCard() {
  const t = await getTranslations('themeSettings');

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={cn(SURFACE_INSET, 'flex flex-col gap-3 bg-au-card p-3 ring-2 ring-au-accent')} aria-current="true">
        <div className="h-20 rounded-lg bg-au-hero" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-au-ink">{t('aurora')}</span>
            <span className="text-xs text-au-muted">{t('auroraHint')}</span>
          </div>
          <span className={CHIP_OK}>
            <Check className="size-3.5" strokeWidth={2} aria-hidden />
            {t('active')}
          </span>
        </div>
      </div>
      <div className={cn(SURFACE_INSET, 'flex cursor-not-allowed flex-col gap-3 p-3 opacity-70')} aria-disabled="true">
        <div className="h-20 rounded-lg bg-au-primary" aria-hidden />
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold text-au-ink">{t('dark')}</span>
          <span className={CHIP_NEUTRAL}>{t('soon')}</span>
        </div>
      </div>
    </div>
  );
}
