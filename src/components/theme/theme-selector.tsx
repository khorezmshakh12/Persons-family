'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useBackground } from './background-context';
import { PRESET_THEMES } from '@/lib/background-themes';
import { cn } from '@/lib/utils';

export function ThemeSelector() {
  const t = useTranslations('settings');
  const { backgroundUrl, setBackgroundUrl } = useBackground();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {PRESET_THEMES.map((theme) => {
        const active = backgroundUrl === theme.url;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setBackgroundUrl(theme.url)}
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
    </div>
  );
}
