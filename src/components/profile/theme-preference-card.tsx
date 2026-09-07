'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, Check, Palette, Layers, Cpu, LayoutGrid, Crown, Waves, Compass, Trees, Mountain, Orbit } from 'lucide-react';
import { useBackground } from '@/components/theme/background-context';
import { DESIGN_VARIANTS, type DesignTheme } from '@/lib/background-themes';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export function ThemePreferenceCard() {
  const t = useTranslations('settings');
  const { activeDesignId, setDesignVariant, setBackgroundUrl, setThemeMode } = useBackground();

  const ICONS: Record<string, typeof Sparkles> = {
    aurora: Sparkles,
    kyoto: Trees,
    midnight: Crown,
    nordic: Mountain,
    cosmic: Orbit,
    studio: LayoutGrid,
  };

  const PREVIEW_BACKGROUNDS: Record<string, string> = {
    aurora: 'bg-gradient-to-br from-teal-900/80 via-slate-900 to-emerald-950/80',
    kyoto: 'bg-gradient-to-br from-emerald-950 via-teal-950 to-slate-950',
    midnight: 'bg-gradient-to-br from-amber-950/60 via-slate-950 to-black',
    nordic: 'bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950',
    cosmic: 'bg-gradient-to-tr from-purple-900/70 via-teal-900/60 to-slate-950',
    studio: 'bg-[#0f131a]',
  };

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-6 p-6 shadow-2xl')}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300 border border-teal-400/30">
            <Palette className="size-5" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-lg font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
                Platforma Dizayni (6 xil variant)
              </h2>
              <span className="rounded-full bg-teal-400/20 px-2.5 py-0.5 text-[11px] font-semibold text-teal-300 border border-teal-400/30">
                Zenith Aurora & Motion
              </span>
            </div>
            <p className="text-xs text-white/70">
              Shisha, Neomorfizm, Kiber yoki Bento kabi butunlay boshqa dizayn uslublarini profilingizdan tanlang.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DESIGN_VARIANTS.map((design: DesignTheme) => {
          const isActive = activeDesignId === design.id;
          const IconComp = ICONS[design.id] ?? Compass;
          const previewBg = PREVIEW_BACKGROUNDS[design.id] ?? 'bg-slate-900';

          return (
            <button
              key={design.id}
              type="button"
              onClick={() => {
                setDesignVariant(design.id);
                if (design.url) {
                  setBackgroundUrl(design.url);
                  setThemeMode('photo');
                }
              }}
              className={cn(
                'group relative flex flex-col justify-between overflow-hidden rounded-2xl border-2 p-4 text-left transition-all duration-300 ease-bounce hover:scale-[1.02] active:scale-95',
                isActive
                  ? 'border-teal-400 bg-teal-500/15 shadow-[0_0_30px_rgba(45,212,191,0.3)] ring-2 ring-teal-400/50'
                  : 'border-white/15 bg-white/5 hover:border-white/35 hover:bg-white/10',
              )}
            >
              {/* Thumbnail / Motion Preview Box */}
              <div
                className={cn(
                  'relative mb-3 h-28 w-full overflow-hidden rounded-xl border border-white/15',
                  previewBg,
                )}
              >
                {design.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={design.url}
                    alt={design.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-70"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <IconComp className="size-10 text-white/30 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-black/30 to-transparent" />

                {/* Active Check Badge */}
                {isActive && (
                  <span className="animate-pop-in absolute top-2 right-2 flex size-6 items-center justify-center rounded-full bg-teal-400 text-slate-950 shadow-md font-bold">
                    <Check className="size-4" />
                  </span>
                )}

                {/* Badge Tag */}
                <span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold tracking-wider text-teal-300 uppercase backdrop-blur-md border border-white/10">
                  {design.badge}
                </span>

                {/* Theme Name Overlay */}
                <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
                  <IconComp className="size-3.5 text-teal-300" />
                  {design.styleName}
                </span>
              </div>

              {/* Title & Tagline */}
              <div className="flex flex-col gap-1">
                <span className="font-bold text-sm text-white line-clamp-1">{design.subtitle}</span>
                <span className="text-xs text-white/70 line-clamp-2 leading-relaxed">{design.tagline}</span>
              </div>

              {/* Palette Color Dots */}
              <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2.5">
                <div className="flex items-center gap-1.5">
                  {design.accentColors.map((color, idx) => (
                    <span
                      key={idx}
                      className="size-3 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <span className={cn('text-xs font-semibold', isActive ? 'text-teal-300' : 'text-white/50')}>
                  {isActive ? 'Faol Uslub' : 'Tanlash'}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}