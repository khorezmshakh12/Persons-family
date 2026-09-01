'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useBackground } from './background-context';
import { PRESET_THEMES, VIDEO_THEMES } from '@/lib/background-themes';
import { cn } from '@/lib/utils';

export function ThemeSelector() {
  const t = useTranslations('settings');
  const { backgroundUrl, setBackgroundUrl, themeMode, setThemeMode, videoThemeId, setVideoThemeId } = useBackground();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {VIDEO_THEMES.map((theme) => {
        const active = themeMode === 'video' && videoThemeId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => {
              setVideoThemeId(theme.id);
              setThemeMode('video');
            }}
            className={cn(
              'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-slate-900 transition-transform duration-200 ease-bounce hover:scale-[1.03] active:scale-95',
              active ? 'border-white ring-2 ring-white/50' : 'border-white/20',
            )}
            aria-pressed={active}
          >
            <video
              autoPlay
              loop
              muted
              playsInline
              preload="none"
              className="absolute inset-0 h-full w-full object-cover opacity-80"
              src={theme.url}
            />
            <span className="relative z-10 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-xs font-medium text-white">
              {t(`themes.${theme.id}`)}
            </span>
            {active && (
              <span className="animate-pop-in absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-white text-black">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}

      {PRESET_THEMES.map((theme) => {
        const active = themeMode === 'photo' && backgroundUrl === theme.url;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => {
              setBackgroundUrl(theme.url);
              setThemeMode('photo');
            }}
            className={cn(
              'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-cover bg-center transition-transform duration-200 ease-bounce hover:scale-[1.03] active:scale-95',
              active ? 'border-white ring-2 ring-white/50' : 'border-white/20',
            )}
            style={{ backgroundImage: `url(${theme.url})` }}
            aria-pressed={active}
          >
            <span className="bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-xs font-medium text-white">
              {t(`themes.${theme.id}`)}
            </span>
            {active && (
              <span className="animate-pop-in absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-white text-black">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
