'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast as sonner } from 'sonner';
import { ArrowRight, Calculator, Gauge, Layers, Map as MapIcon, Search, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/* =====================================================================
   Sound — Web Audio blips, opt-in (default off), remembered per browser.
   ===================================================================== */
export type SoundKind = 'tick' | 'nav' | 'open' | 'close' | 'ok' | 'err';
const SND_KEY = 'persons-sound';
let actx: AudioContext | null = null;
let soundOn = false;
try {
  soundOn = typeof window !== 'undefined' && localStorage.getItem(SND_KEY) === 'true';
} catch {}

export function playSound(kind: SoundKind) {
  if (!soundOn || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    actx ??= new Ctx();
    const ctx = actx;
    const t = ctx.currentTime;
    const tone = (f: number, f2: number, st: number, d: number, v = 0.05, type: OscillatorType = 'sine') => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t + st);
      o.frequency.exponentialRampToValueAtTime(f2, t + st + d);
      g.gain.setValueAtTime(0, t + st);
      g.gain.linearRampToValueAtTime(v, t + st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + st + d);
      o.connect(g).connect(ctx.destination);
      o.start(t + st);
      o.stop(t + st + d + 0.02);
    };
    if (kind === 'tick') tone(1800, 1200, 0, 0.045, 0.025, 'triangle');
    else if (kind === 'nav') {
      tone(520, 780, 0, 0.12, 0.04);
      tone(1040, 1040, 0.05, 0.08, 0.015, 'triangle');
    } else if (kind === 'open') tone(420, 860, 0, 0.16, 0.045);
    else if (kind === 'close') tone(760, 380, 0, 0.13, 0.035);
    else if (kind === 'ok') {
      tone(660, 660, 0, 0.12, 0.045);
      tone(990, 990, 0.09, 0.2, 0.045);
    } else tone(300, 180, 0, 0.22, 0.05, 'sawtooth');
  } catch {}
}

/** sonner toasts that also chime. */
export const toast = {
  success: (m: string) => {
    playSound('ok');
    return sonner.success(m);
  },
  error: (m: string) => {
    playSound('err');
    return sonner.error(m);
  },
  message: (m: string) => {
    playSound('tick');
    return sonner(m);
  },
};

/* =====================================================================
   Suite context — sections, palette, shortcuts.
   ===================================================================== */
export type PaletteItem = { g: string; t: string; sub?: string; k?: string; run: () => void };
type Suite = { openPalette: () => void };
const SuiteCtx = createContext<Suite>({ openPalette: () => {} });
export const useSuite = () => useContext(SuiteCtx);

export type SectionKey = 'str' | 'acct' | 'ops' | 'pf';
const SECTIONS: { k: SectionKey; n: string; href: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { k: 'str', n: 'Strategiya', href: '/strategy', Icon: MapIcon },
  { k: 'acct', n: 'Hisob-kitob', href: '/accounting', Icon: Calculator },
  { k: 'ops', n: 'Operatsiya HQ', href: '/operations', Icon: Gauge },
  { k: 'pf', n: 'Persons Perforce', href: '/perforce', Icon: Layers },
];

const RIPPLE_SEL =
  '.sx-btn,.sx-tabs button,.sx-seg button,.sx-flow button,.sx-fchip,.sx-spaces button,.sx-secbar a,.sx-secbar button,.rm-pick button,.sx-chipb';

export function SuiteShell({
  section,
  tabs,
  onTab,
  items,
  onNew,
  children,
}: {
  section: SectionKey;
  /** Current section's tabs, in order — keys 1–9 jump to them. */
  tabs: { v: string; n: string }[];
  onTab: (v: string) => void;
  /** Extra palette entries (actions, records). */
  items: PaletteItem[];
  /** N shortcut. */
  onNew?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [ck, setCk] = useState(false);
  const [snd, setSnd] = useState(false);
  const [bar, setBar] = useState(0);

  useEffect(() => {
    // Mirror the module-level flag into state once (mount-only).
    const on = soundOn;
    if (on) setSnd(true);
  }, []);

  const toggleSound = useCallback(() => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(SND_KEY, String(soundOn));
    } catch {}
    setSnd(soundOn);
    if (soundOn) playSound('ok');
    sonner(soundOn ? 'UI ovozlari yoqildi' : "UI ovozlari o'chirildi");
  }, []);

  const tab = useCallback(
    (v: string) => {
      playSound('nav');
      setBar((b) => b + 1);
      onTab(v);
    },
    [onTab],
  );

  // Keyboard: Ctrl/⌘K or / → palette · 1–9 → tab · N → new · M → sound.
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCk(true);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || ck) return;
      if (document.querySelector('.sx-drawer.open,[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        setCk(true);
      } else if (/^[1-9]$/.test(e.key)) {
        const t = tabs[Number(e.key) - 1];
        if (t) tab(t.v);
      } else if ((e.key === 'n' || e.key === 'N') && onNew) {
        e.preventDefault();
        onNew();
      } else if (e.key === 'm' || e.key === 'M') toggleSound();
    };
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, [tabs, tab, onNew, toggleSound, ck]);

  // Ripple + click tick + card spotlight — delegated on the suite root.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const down = (e: PointerEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(RIPPLE_SEL);
      if (!b) return;
      const r = b.getBoundingClientRect();
      const s = Math.max(r.width, r.height) * 2.2;
      const d = document.createElement('span');
      d.className = 'sx-rpl';
      d.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
      b.appendChild(d);
      setTimeout(() => d.remove(), 650);
      playSound('tick');
    };
    const move = (e: PointerEvent) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('.sx-card');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move, { passive: true });
    return () => {
      root.removeEventListener('pointerdown', down);
      root.removeEventListener('pointermove', move);
    };
  }, []);

  const all: PaletteItem[] = useMemo(
    () => [
      ...tabs.map((t, i) => ({ g: "Bo'limlar", t: t.n, sub: SECTIONS.find((s) => s.k === section)!.n, k: String(i + 1), run: () => tab(t.v) })),
      ...SECTIONS.filter((s) => s.k !== section).map((s) => ({
        g: "Bo'limlar",
        t: s.n,
        sub: 'Boshqa bo‘lim',
        run: () => {
          playSound('nav');
          router.push(s.href);
        },
      })),
      ...items,
      { g: 'Amallar', t: snd ? "UI ovozlarini o'chirish" : 'UI ovozlarini yoqish', k: 'M', run: toggleSound },
    ],
    [tabs, items, section, snd, tab, toggleSound, router],
  );

  return (
    <SuiteCtx.Provider value={{ openPalette: () => setCk(true) }}>
      <div ref={rootRef} className="sx-root sx-suite flex min-h-0 flex-1 flex-col">
        <span key={bar} className={cn('sx-topbar', bar > 0 && 'go')} aria-hidden />
        <nav className="sx-secbar mx-4 sm:mx-7" aria-label="Strategiya bo'limlari">
          <span className="flex-1" />
          <button className="kbtn" onClick={() => setCk(true)}>
            <Search className="size-4" />
            <span>Qidirish yoki buyruq…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button className={cn('ibtn', snd && 'on')} onClick={toggleSound} title="UI ovozlari (M)" aria-label="UI ovozlari">
            {snd ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
            <span className="eq" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </button>
        </nav>
        {children}
        {ck && <Palette items={all} onClose={() => setCk(false)} />}
      </div>
    </SuiteCtx.Provider>
  );
}

function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const Q = q.trim().toLowerCase();
  const list = items.filter((x) => !Q || `${x.t} ${x.sub ?? ''}`.toLowerCase().includes(Q)).slice(0, 40);
  const cur = Math.min(sel, Math.max(0, list.length - 1));

  useEffect(() => {
    playSound('open');
    const r = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const close = () => {
    playSound('close');
    onClose();
  };
  const run = (i: number) => {
    const x = list[i];
    if (!x) return;
    onClose();
    setTimeout(x.run, 40);
  };
  const mark = (s: string) => {
    if (!Q) return s;
    const i = s.toLowerCase().indexOf(Q);
    return i < 0 ? s : (
      <>
        {s.slice(0, i)}
        <mark>{s.slice(i, i + Q.length)}</mark>
        {s.slice(i + Q.length)}
      </>
    );
  };
  let g = '';
  return (
    <div className={cn('sx-ck-bg', open && 'open')} onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sx-ck" role="dialog" aria-label="Buyruqlar paneli">
        <div className="ck-in">
          <Search className="size-5 text-au-faint" />
          <input
            autoFocus
            value={q}
            placeholder="Bo'lim, amal yoki yozuv nomini yozing…"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close();
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((cur + 1) % Math.max(1, list.length));
                playSound('tick');
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((cur - 1 + list.length) % Math.max(1, list.length));
                playSound('tick');
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(cur);
              }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="ck-l" ref={listRef}>
          {list.length === 0 && <div className="ck-e">«{q}» bo‘yicha hech narsa topilmadi</div>}
          {list.map((x, i) => {
            const head = x.g !== g ? (g = x.g) : null;
            return (
              <div key={`${x.g}-${x.t}-${i}`}>
                {head && <div className="ck-g">{head}</div>}
                <button
                  data-i={i}
                  className={cn('ck-it', i === cur && 'sel')}
                  style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => run(i)}
                >
                  <span className="t">{mark(x.t)}</span>
                  {x.sub && <small>{x.sub}</small>}
                  {x.k && <kbd>{x.k}</kbd>}
                  <ArrowRight className="go size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <div className="ck-f">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> tanlash
          </span>
          <span>
            <kbd>Enter</kbd> ochish
          </span>
          <span>
            <kbd>1</kbd>–<kbd>9</kbd> tablar
          </span>
          <span>
            <kbd>N</kbd> yangi
          </span>
          <span>
            <kbd>M</kbd> ovoz
          </span>
        </div>
      </div>
    </div>
  );
}

/** Tab bar with a sliding ink + optional group labels (Hisob-kitob). */
export function SuiteTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: ({ v: string; n: string; Icon?: React.ComponentType<{ className?: string }> } | { g: string })[];
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<React.CSSProperties>({});
  useEffect(() => {
    const on = ref.current?.querySelector<HTMLButtonElement>(`button[data-v="${value}"]`);
    if (on) setInk({ transform: `translateX(${on.offsetLeft}px)`, width: on.offsetWidth });
  }, [value]);
  return (
    <div className="sx-tabs" ref={ref}>
      <span className="ink" style={ink} aria-hidden />
      {tabs.map((t) =>
        'g' in t ? (
          <span key={t.g} className="tg">
            {t.g}
          </span>
        ) : (
          <button key={t.v} data-v={t.v} className={cn(value === t.v && 'on')} onClick={() => onChange(t.v)}>
            {t.Icon && <t.Icon className="size-4" />}
            <span>{t.n}</span>
          </button>
        ),
      )}
    </div>
  );
}

/** Section page header (title + serif accent + status pill). */
export function SectionHead({
  crumb,
  title,
  em,
  pill,
  pillTone = 'ok',
  right,
}: {
  crumb: string;
  title: string;
  em: string;
  pill?: string;
  pillTone?: 'ok' | 'bad';
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-au-muted">{crumb}</div>
        <h1 className="sx-title">
          {title} <em>{em}</em>
        </h1>
      </div>
      {pill && (
        <span className={cn('sx-pill', pillTone)}>
          <i />
          {pill}
        </span>
      )}
      <div className="flex-1" />
      {right}
    </div>
  );
}
