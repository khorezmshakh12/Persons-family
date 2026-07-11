'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useBackground } from './background-context';
import { PRESET_THEMES } from '@/lib/background-themes';
import { cn } from '@/lib/utils';

export function ThemeSelector() {
  const t = useTranslations('settings');
  const { backgroundUrl, themeMode, setThemeMode } = useBackground();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {PRESET_THEMES.map((theme) => {
        const active = themeMode === 'photo' && backgroundUrl === theme.url;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setThemeMode('photo')}
            className={cn(
              'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-cover bg-center transition-all hover:scale-[1.03]',
              active ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
            )}
            style={{ backgroundImage: `url(${theme.url})` }}
            aria-pressed={active}
          >
            <span className="bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-xs font-medium text-white">
              {t(`themes.${theme.id}`)}
            </span>
            {active && (
              <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => setThemeMode('flat-white')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-white transition-all hover:scale-[1.03]',
          themeMode === 'flat-white' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
        )}
        aria-pressed={themeMode === 'flat-white'}
      >
        <span className="px-2 py-1.5 text-left text-xs font-medium text-slate-900">{t('themes.flatWhite')}</span>
        {themeMode === 'flat-white' && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setThemeMode('flat-black')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-zinc-900 transition-all hover:scale-[1.03]',
          themeMode === 'flat-black' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
        )}
        aria-pressed={themeMode === 'flat-black'}
      >
        <span className="px-2 py-1.5 text-left text-xs font-medium text-white">{t('themes.flatBlack')}</span>
        {themeMode === 'flat-black' && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setThemeMode('mint')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-gradient-to-br from-white to-teal-50 transition-all hover:scale-[1.03]',
          themeMode === 'mint' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
        )}
        aria-pressed={themeMode === 'mint'}
      >
        <span className="px-2 py-1.5 text-left text-xs font-medium text-slate-800">{t('themes.mint')}</span>
        {themeMode === 'mint' && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setThemeMode('navy')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-[#0F172A] transition-all hover:scale-[1.03]',
          themeMode === 'navy' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-indigo-400/30',
        )}
        aria-pressed={themeMode === 'navy'}
      >
        <span className="px-2 py-1.5 text-left text-xs font-medium text-white">{t('themes.navy')}</span>
        {themeMode === 'navy' && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={() => setThemeMode('latte')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-[#FDFBF7] transition-all hover:scale-[1.03]',
          themeMode === 'latte' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
        )}
        aria-pressed={themeMode === 'latte'}
      >
        <span className="px-2 py-1.5 text-left text-xs font-medium text-[#3B2A1A]">{t('themes.latte')}</span>
        {themeMode === 'latte' && (
          <span className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>
    </div>
  );
}
