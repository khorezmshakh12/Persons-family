'use client';

import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { useBackground } from './background-context';
import { PRESET_THEMES } from '@/lib/background-themes';
import { cn } from '@/lib/utils';

const CINEMATIC_VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export function ThemeSelector() {
  const t = useTranslations('settings');
  const { backgroundUrl, themeMode, setThemeMode } = useBackground();

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <button
        type="button"
        onClick={() => setThemeMode('video')}
        className={cn(
          'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-slate-900 transition-transform duration-200 ease-bounce hover:scale-[1.03] active:scale-95',
          themeMode === 'video' ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
        )}
        aria-pressed={themeMode === 'video'}
      >
        <video
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          src={CINEMATIC_VIDEO_URL}
        />
        <span className="relative z-10 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-xs font-medium text-white">
          {t('themes.cinematic')}
        </span>
        {themeMode === 'video' && (
          <span className="animate-pop-in absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
            <Check className="size-3" />
          </span>
        )}
      </button>

      {PRESET_THEMES.map((theme) => {
        const active = themeMode === 'photo' && backgroundUrl === theme.url;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => setThemeMode('photo')}
            className={cn(
              'group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl border-2 bg-cover bg-center transition-transform duration-200 ease-bounce hover:scale-[1.03] active:scale-95',
              active ? 'border-teal-400 ring-2 ring-teal-400/50' : 'border-white/20',
            )}
            style={{ backgroundImage: `url(${theme.url})` }}
            aria-pressed={active}
          >
            <span className="bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-left text-xs font-medium text-white">
              {t(`themes.${theme.id}`)}
            </span>
            {active && (
              <span className="animate-pop-in absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full bg-teal-400 text-white">
                <Check className="size-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
