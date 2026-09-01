'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Check, Palette, Mountain, Trees, Moon, Compass, Orbit } from 'lucide-react';
import { useBackground } from '@/components/theme/background-context';
import { DESIGN_VARIANTS } from '@/lib/background-themes';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export function ThemePreferenceCard() {
  const t = useTranslations('settings');
  const { activeDesignId, setDesignVariant, setBackgroundUrl, setThemeMode } = useBackground();

  const ICONS: Record<string, typeof Sparkles> = {
    aurora: Sparkles,
    kyoto: Trees,
    midnight: Moon,
    nordic: Mountain,
    cosmic: Orbit,
  };

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6 shadow-2xl')}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30">
            <Palette className="size-5" />
          </div>
          <div className="flex flex-col">
            <h2 className="font-heading text-lg font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
              Platforma Dizayni (5 xil variant)
            </h2>
            <p className="text-xs text-white/70">
              Platformaning to&apos;liq ko&apos;rinishi, shisha uslubi va tinchlantiruvchi atmosferasini tanlang.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {DESIGN_VARIANTS.map((design) => {
          const isActive = activeDesignId === design.id;
          const IconComp = ICONS[design.id] ?? Compass;

          return (
            <button
              key={design.id}
              type="button"
              onClick={() => {
                setDesignVariant(design.id);
                setBackgroundUrl(design.url);
                setThemeMode('photo');
              }}
              className={cn(
                'group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 p-3 text-left transition-all duration-300 ease-bounce hover:scale-[1.03] active:scale-95',
                isActive
                  ? 'border-white bg-white/20 shadow-[0_0_25px_rgba(255,255,255,0.3)] ring-2 ring-white/50'
                  : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10',
              )}
            >
              {/* Thumbnail Image Backdrop */}
              <div className="relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-white/15 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={design.url}
                  alt={design.name}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-black/20 to-transparent" />

                {/* Active Check Badge */}
                {isActive && (
                  <span className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-emerald-400 text-slate-950 shadow-md font-bold">
                    <Check className="size-4" />
                  </span>
                )}

                {/* Theme Icon */}
                <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-md">
                  <IconComp className="size-3 text-amber-300" />
                  {design.name}
                </span>
              </div>

              {/* Title & Tagline */}
              <div className="flex flex-col gap-1">
                <span className="font-bold text-sm text-white line-clamp-1">{design.subtitle}</span>
                <span className="text-xs text-white/70 line-clamp-2 leading-relaxed">{design.tagline}</span>
              </div>

              {/* Palette Color Dots */}
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2">
                <div className="flex items-center gap-1.5">
                  {design.accentColors.map((color, idx) => (
                    <span
                      key={idx}
                      className="size-3 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className={cn('text-xs font-semibold', isActive ? 'text-emerald-300' : 'text-white/50')}>
                  {isActive ? 'Faol' : 'Tanlash'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}