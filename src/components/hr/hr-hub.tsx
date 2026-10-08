'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Cake, Check, ClipboardList, Flame, Network, PartyPopper, Plus, Search, ShieldCheck, Sparkles, Star, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { SURFACE_CARD } from '@/lib/glass';
import { celebrate } from '@/components/motion/events';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { addOnboardingItemAction, startOnboardingAction, toggleOnboardingItemAction, updateEmploymentAction } from '@/lib/actions/hr';
import type { HrPerson, OnboardingItem } from '@/lib/hr-data';
import type { Department } from '@/lib/permissions';

export type HrTab = 'people' | 'org' | 'onboarding' | 'analytics';

const DEPT_ORDER: Department[] = ['top', 'acad', 'com', 'ops', 'fin', 'hr'];
const DEPT_TONE: Record<Department, string> = {
  top: 'var(--au-ink)',
  acad: 'var(--au-info)',
  com: 'var(--au-accent)',
  ops: 'var(--au-chart-2)',
  fin: 'var(--au-ok)',
  hr: 'var(--au-chart-3)',
};
const GRADE: Record<string, string> = { great: 'bg-au-ok', good: 'bg-au-accent', bad: 'bg-au-bad' };

/** Whole months between two YYYY-MM-DD keys. */
const monthsBetween = (from: string, to: string) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
};
const tenure = (hire: string | null, today: string) => {
  if (!hire) return null;
  const m = Math.max(0, monthsBetween(hire, today));
  return m < 12 ? `${m} oy` : `${Math.floor(m / 12)} yil${m % 12 ? ` ${m % 12} oy` : ''}`;
};

function Avatar({ p, size = 44 }: { p: Pick<HrPerson, 'avatar' | 'name' | 'dept'>; size?: number }) {
  return p.avatar ? (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
    <img src={p.avatar} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      className="grid shrink-0 place-items-center rounded-full text-sm font-bold text-white uppercase"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${DEPT_TONE[p.dept]} 85%, var(--au-card))` }}
    >
      {p.name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}

function KpiDots({ kpi }: { kpi: HrPerson['kpi'] }) {
  if (!kpi.length) return <span className="text-[11px] text-au-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label="KPI">
      {kpi.map((k) => (
        <i key={k.month} title={`${k.month.slice(0, 7)}: ${k.grade ?? '—'}`} className={cn('size-2 rounded-full', k.grade ? GRADE[k.grade] : 'bg-au-card-2 ring-1 ring-au-line')} />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------ profile */

function Profile({ p, isManager, today, roleLabels, deptLabels, onboarding, onClose }: {
  p: HrPerson;
  isManager: boolean;
  today: string;
  roleLabels: Record<string, string>;
  deptLabels: Record<Department, string>;
  onboarding: OnboardingItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [hire, setHire] = useState(p.hire_date ?? '');
  const [prob, setProb] = useState(p.probation_until ?? '');
  const stat = (label: string, value: ReactNode, sub?: string) => (
    <div className="rounded-au-ctl bg-au-card-2 p-3">
      <div className="text-[11px] font-semibold text-au-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-au-ink tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-au-faint">{sub}</div>}
    </div>
  );
  return (
    <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-au-line bg-au-card p-0 text-au-ink sm:max-w-lg">
      <SheetHeader className="flex-row items-center gap-4 border-b border-au-line px-5 py-5">
        <Avatar p={p} size={64} />
        <div className="min-w-0">
          <SheetTitle className="truncate text-xl font-bold text-au-ink">{p.name}</SheetTitle>
          <SheetDescription className="text-sm text-au-muted">
            {p.roles.map((r) => roleLabels[r] ?? r).join(' · ')} · {deptLabels[p.dept]}
          </SheetDescription>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {p.hire_date && <span className="rounded-full bg-au-card-2 px-2 py-0.5 font-semibold text-au-muted">Staj: {tenure(p.hire_date, today)}</span>}
            {p.probation_until && p.probation_until >= today && <span className="rounded-full bg-au-accent-soft px-2 py-0.5 font-semibold text-au-accent-text">Sinov: {p.probation_until} gacha</span>}
            {p.phone && <span className="rounded-full bg-au-card-2 px-2 py-0.5 font-semibold text-au-muted">{p.phone}</span>}
          </div>
        </div>
      </SheetHeader>
      <div className="grid gap-4 px-5 py-5">
        <div className="grid grid-cols-2 gap-2">
          {stat('Yulduzlar', <span className="inline-flex items-center gap-1"><Star className="size-4 text-au-accent-text" />{p.stars}</span>)}
          {stat('KPI · 6 oy', <KpiDots kpi={p.kpi} />)}
          {stat('Self-dev', p.selfDev.score ?? '—', p.selfDev.months ? `${p.selfDev.months} oy ketma-ket` : undefined)}
          {stat('Vazifalar o‘z vaqtida', p.tasks.onTime === null ? '—' : `${p.tasks.onTime}%`, `${p.tasks.open} ochiq · ${p.tasks.overdue} kechikkan`)}
          {p.lessons !== null && stat('Dars rejalari (30 kun)', `${p.lessons}%`, 'muddatida to‘liq')}
          {p.onboarding.total > 0 && stat('Onboarding', `${p.onboarding.done}/${p.onboarding.total}`)}
        </div>

        {onboarding.length > 0 && <Checklist items={onboarding} canEdit userId={p.id} isManager={isManager} />}

        {isManager && (
          <div className="grid gap-2 rounded-au-ctl border border-au-line p-3">
            <div className="text-xs font-semibold text-au-muted">Ish ma’lumotlari</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                Ishga kirgan sana
                <input type="date" value={hire} onChange={(e) => setHire(e.target.value)} className="h-9 rounded-au-ctl border border-au-line bg-au-card px-2 text-sm text-au-ink" />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold text-au-muted">
                Sinov muddati tugashi
                <input type="date" value={prob} onChange={(e) => setProb(e.target.value)} className="h-9 rounded-au-ctl border border-au-line bg-au-card px-2 text-sm text-au-ink" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await updateEmploymentAction({ userId: p.id, hireDate: hire || null, probationUntil: prob || null });
                    if (r.error) return void toast.error('Saqlab bo‘lmadi');
                    toast.success('Saqlandi');
                    router.refresh();
                  })
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-au-ctl bg-au-primary px-3.5 text-sm font-semibold text-au-primary-ink hover:opacity-90"
              >
                <Check className="size-4" /> Saqlash
              </button>
              {p.onboarding.total === 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      const r = await startOnboardingAction(p.id);
                      if (r.error) return void toast.error('Boshlab bo‘lmadi');
                      toast.success('Onboarding boshlandi');
                      onClose();
                      router.refresh();
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-au-ctl border border-au-line bg-au-card px-3.5 text-sm font-semibold text-au-ink hover:bg-au-card-2"
                >
                  <ClipboardList className="size-4" /> Onboarding boshlash
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </SheetContent>
  );
}

/* ------------------------------------------------------------ checklist */

function Checklist({ items, canEdit, userId, isManager }: { items: OnboardingItem[]; canEdit: boolean; userId: string; isManager: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [add, setAdd] = useState('');
  const isDone = (i: OnboardingItem) => local[i.id] ?? !!i.done_at;
  const done = items.filter(isDone).length;
  const share = items.length ? done / items.length : 0;
  return (
    <div className="grid gap-2 rounded-au-ctl border border-au-line p-3">
      <div className="flex items-center gap-3">
        <span className="relative grid size-11 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--au-card-2)" strokeWidth="4" />
            <circle cx="18" cy="18" r="15" fill="none" stroke={share === 1 ? 'var(--au-ok)' : 'var(--au-accent)'} strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray={`${share} 1`} className="ms-arc transition-[stroke-dasharray] duration-500" />
          </svg>
          <span className="text-[10px] font-bold text-au-ink tabular-nums">{Math.round(share * 100)}%</span>
        </span>
        <div>
          <div className="text-sm font-bold text-au-ink">Onboarding</div>
          <div className="text-xs text-au-muted">
            {done}/{items.length} bajarildi
          </div>
        </div>
      </div>
      <ul className="grid gap-1">
        {items.map((it, i) => {
          const d = isDone(it);
          return (
            <li key={it.id} className="ms-rise" style={{ ['--i' as string]: Math.min(i, 8) }}>
              <button
                type="button"
                disabled={!canEdit || busy}
                onClick={() =>
                  start(async () => {
                    setLocal((l) => ({ ...l, [it.id]: !d }));
                    const r = await toggleOnboardingItemAction(it.id, !d);
                    if (r.error) {
                      setLocal((l) => ({ ...l, [it.id]: d }));
                      return void toast.error('Saqlab bo‘lmadi');
                    }
                    if (!d && done + 1 === items.length) celebrate('Onboarding yakunlandi!');
                    router.refresh();
                  })
                }
                className="flex w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-au-card-2"
              >
                <span key={String(d)} className={cn('grid size-5 shrink-0 place-items-center rounded-[6px] border', d ? 'ms-pop-in border-au-ok bg-au-ok text-white' : 'border-au-line')}>
                  {d && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className={cn(d ? 'text-au-muted line-through' : 'text-au-ink')}>{it.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {isManager && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!add.trim()) return;
            start(async () => {
              const r = await addOnboardingItemAction({ userId, title: add });
              if (r.error) return void toast.error('Qo‘shib bo‘lmadi');
              setAdd('');
              router.refresh();
            });
          }}
        >
          <input value={add} onChange={(e) => setAdd(e.target.value)} maxLength={200} placeholder="Yangi band" className="h-8 flex-1 rounded-au-ctl border border-au-line bg-au-card px-2.5 text-sm text-au-ink" />
          <button type="submit" disabled={busy} className="grid size-8 place-items-center rounded-au-ctl bg-au-card-2 text-au-ink hover:bg-au-line" aria-label="Qo‘shish">
            <Plus className="size-4" />
          </button>
        </form>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ hub */

export function HrHub({
  people,
  onboarding,
  isManager,
  meId,
  today,
  tab,
  roleLabels,
  deptLabels,
  analyticsExtra,
}: {
  people: HrPerson[];
  onboarding: OnboardingItem[];
  isManager: boolean;
  meId: string;
  today: string;
  tab: HrTab;
  roleLabels: Record<string, string>;
  deptLabels: Record<Department, string>;
  /** Server-rendered extra for the analytics tab (task statistics table). */
  analyticsExtra?: ReactNode;
}) {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<Department | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const month = today.slice(5, 7);
  const visible = useMemo(
    () =>
      people.filter(
        (p) =>
          (dept === 'all' || p.dept === dept) &&
          (!q || `${p.name} ${p.roles.map((r) => roleLabels[r] ?? r).join(' ')}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [people, dept, q, roleLabels],
  );
  const probation = people.filter((p) => p.probation_until && p.probation_until >= today);
  const birthdays = people.filter((p) => p.date_of_birth?.slice(5, 7) === month).sort((a, b) => a.date_of_birth!.slice(8).localeCompare(b.date_of_birth!.slice(8)));
  const anniversaries = people.filter((p) => p.hire_date && p.hire_date.slice(5, 7) === month && p.hire_date.slice(0, 4) < today.slice(0, 4));
  const onboardingPeople = people.filter((p) => p.onboarding.total > 0 && p.onboarding.done < p.onboarding.total);
  const open = people.find((p) => p.id === openId) ?? null;

  const strip = [
    { k: 'Faol xodimlar', v: people.length, icon: Users, tone: 'text-au-ink' },
    { k: 'Sinov muddatida', v: probation.length, icon: ShieldCheck, tone: probation.length ? 'text-au-accent-text' : 'text-au-ink' },
    { k: 'Bu oy tug‘ilgan kun', v: birthdays.length, icon: Cake, tone: birthdays.length ? 'text-au-info' : 'text-au-ink' },
    { k: 'Ish yubileyi', v: anniversaries.length, icon: PartyPopper, tone: anniversaries.length ? 'text-au-ok' : 'text-au-ink' },
    { k: 'Onboardingda', v: onboardingPeople.length, icon: ClipboardList, tone: onboardingPeople.length ? 'text-au-accent-text' : 'text-au-ink' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {isManager && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {strip.map((s, i) => (
            <div key={s.k} className={cn(SURFACE_CARD, 'ms-rise flex items-center gap-3 px-4 py-3')} style={{ ['--i' as string]: i }}>
              <s.icon className={cn('size-[18px] shrink-0', s.tone)} strokeWidth={1.75} aria-hidden />
              <div className="min-w-0">
                <div className={cn('text-xl leading-6 font-bold tabular-nums', s.tone)}>{s.v}</div>
                <div className="truncate text-xs text-au-muted">{s.k}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'people' && (
        <>
          {isManager && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-au-faint" aria-hidden />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ism yoki lavozim" className="h-9 w-full rounded-au-ctl border border-au-line bg-au-card pr-3 pl-9 text-sm text-au-ink" />
              </label>
              {(['all', ...DEPT_ORDER] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDept(d)}
                  aria-pressed={dept === d}
                  className={cn('h-8 rounded-full px-3 text-xs font-semibold transition-colors', dept === d ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
                >
                  {d === 'all' ? `Hammasi · ${people.length}` : `${deptLabels[d]} · ${people.filter((p) => p.dept === d).length}`}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visible.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpenId(p.id)}
                className={cn(SURFACE_CARD, 'ms-rise group flex flex-col gap-3 p-4 text-left transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-au-card-hover focus-visible:ring-2 focus-visible:ring-au-accent focus-visible:outline-none')}
                style={{ ['--i' as string]: Math.min(i, 10) }}
              >
                <span className="flex items-center gap-3">
                  <Avatar p={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-au-ink">
                      {p.name}
                      {p.id === meId && <span className="ml-1.5 text-[10px] font-bold text-au-accent-text">· siz</span>}
                    </span>
                    <span className="block truncate text-xs text-au-muted">{p.roles.map((r) => roleLabels[r] ?? r).join(' · ')}</span>
                  </span>
                  {p.probation_until && p.probation_until >= today && <ShieldCheck className="size-4 shrink-0 text-au-accent-text" aria-label="Sinov muddatida" />}
                </span>
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-semibold text-au-ink">
                    <Star className="size-3.5 text-au-accent-text" aria-hidden /> {p.stars}
                  </span>
                  <KpiDots kpi={p.kpi} />
                  <span className="inline-flex items-center gap-1 text-au-muted">
                    <Flame className={cn('size-3.5', p.selfDev.months >= 3 ? 'text-au-accent-text' : 'text-au-faint')} aria-hidden /> {p.selfDev.months}
                  </span>
                  <span className="text-au-faint">{tenure(p.hire_date, today) ?? ''}</span>
                </span>
              </button>
            ))}
          </div>
          {isManager && (birthdays.length > 0 || anniversaries.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              {birthdays.length > 0 && (
                <div className={cn(SURFACE_CARD, 'p-4')}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-au-ink">
                    <Cake className="size-4 text-au-info" /> Bu oy tug‘ilgan kunlar
                  </h3>
                  <ul className="grid gap-1 text-sm">
                    {birthdays.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="text-au-ink">{p.name}</span>
                        <span className={cn('tabular-nums', p.date_of_birth!.slice(5) === today.slice(5) ? 'font-bold text-au-info' : 'text-au-muted')}>
                          {p.date_of_birth!.slice(8)}.{month}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {anniversaries.length > 0 && (
                <div className={cn(SURFACE_CARD, 'p-4')}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-au-ink">
                    <PartyPopper className="size-4 text-au-ok" /> Ish yubileylari
                  </h3>
                  <ul className="grid gap-1 text-sm">
                    {anniversaries.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span className="text-au-ink">{p.name}</span>
                        <span className="text-au-muted tabular-nums">{Number(today.slice(0, 4)) - Number(p.hire_date!.slice(0, 4))} yil</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'org' && <OrgChart people={people} roleLabels={roleLabels} deptLabels={deptLabels} onOpen={setOpenId} />}

      {tab === 'onboarding' && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {people.filter((p) => p.onboarding.total > 0).length === 0 && (
            <p className={cn(SURFACE_CARD, 'p-8 text-center text-sm text-au-muted md:col-span-2 xl:col-span-3')}>
              Hozir onboardingdagi xodim yo‘q. Xodim kartasini ochib «Onboarding boshlash» ni bosing.
            </p>
          )}
          {people
            .filter((p) => p.onboarding.total > 0)
            .map((p) => (
              <div key={p.id} className={cn(SURFACE_CARD, 'grid gap-3 p-4')}>
                <div className="flex items-center gap-3">
                  <Avatar p={p} size={36} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-au-ink">{p.name}</div>
                    <div className="text-xs text-au-muted">{p.hire_date ? `Ishga kirgan: ${p.hire_date}` : roleLabels[p.role]}</div>
                  </div>
                </div>
                <Checklist items={onboarding.filter((o) => o.user_id === p.id)} canEdit={isManager || p.id === meId} userId={p.id} isManager={isManager} />
              </div>
            ))}
        </div>
      )}

      {tab === 'analytics' && <Analytics people={people} today={today} deptLabels={deptLabels} extra={analyticsExtra} />}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        {open && (
          <Profile
            key={open.id}
            p={open}
            isManager={isManager}
            today={today}
            roleLabels={roleLabels}
            deptLabels={deptLabels}
            onboarding={onboarding.filter((o) => o.user_id === open.id)}
            onClose={() => setOpenId(null)}
          />
        )}
      </Sheet>
    </div>
  );
}

/* ------------------------------------------------------------ org chart */

function OrgChart({ people, roleLabels, deptLabels, onOpen }: { people: HrPerson[]; roleLabels: Record<string, string>; deptLabels: Record<Department, string>; onOpen: (id: string) => void }) {
  const depts = DEPT_ORDER.filter((d) => d !== 'top' && people.some((p) => p.dept === d));
  const top = people.filter((p) => p.dept === 'top');
  return (
    <div className={cn(SURFACE_CARD, 'overflow-x-auto p-5')}>
      <div className="min-w-[760px]">
        <div className="flex justify-center gap-3">
          {top.map((p) => (
            <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="ms-pop-in flex items-center gap-2 rounded-full border border-au-line bg-au-card-2 py-1.5 pr-4 pl-1.5 hover:border-au-accent">
              <Avatar p={p} size={34} />
              <span className="text-left">
                <span className="block text-sm font-bold text-au-ink">{p.name}</span>
                <span className="block text-[11px] text-au-muted">{roleLabels[p.role]}</span>
              </span>
            </button>
          ))}
        </div>
        {/* Connectors draw down from leadership to each department. */}
        <svg viewBox={`0 0 ${depts.length * 100} 40`} preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
          {depts.map((d, i) => (
            <path key={d} d={`M ${(depts.length * 100) / 2} 0 C ${(depts.length * 100) / 2} 22, ${i * 100 + 50} 18, ${i * 100 + 50} 40`} pathLength={1} className="ms-draw" fill="none" stroke="var(--au-line)" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </svg>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${depts.length}, minmax(0, 1fr))` }}>
          {depts.map((d, di) => {
            const list = people.filter((p) => p.dept === d);
            return (
              <section key={d} className="ms-rise flex flex-col gap-2 rounded-au-ctl border-t-4 bg-au-card-2 p-3" style={{ borderTopColor: DEPT_TONE[d], ['--i' as string]: di }}>
                <header className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-au-ink">{deptLabels[d]}</h3>
                  <span className="text-xs font-bold text-au-muted tabular-nums">{list.length}</span>
                </header>
                {list.map((p) => (
                  <button key={p.id} type="button" onClick={() => onOpen(p.id)} className="flex items-center gap-2 rounded-[8px] bg-au-card px-2 py-1.5 text-left hover:shadow-au-card">
                    <Avatar p={p} size={26} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-au-ink">{p.name}</span>
                      <span className="block truncate text-[10.5px] text-au-muted">{roleLabels[p.role]}</span>
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ analytics */

function Analytics({ people, today, deptLabels, extra }: { people: HrPerson[]; today: string; deptLabels: Record<Department, string>; extra?: ReactNode }) {
  const byDept = DEPT_ORDER.map((d) => ({ d, n: people.filter((p) => p.dept === d).length })).filter((x) => x.n);
  const maxD = Math.max(1, ...byDept.map((x) => x.n));
  const buckets = [
    { k: '< 6 oy', f: (m: number) => m < 6 },
    { k: '6–12 oy', f: (m: number) => m >= 6 && m < 12 },
    { k: '1–2 yil', f: (m: number) => m >= 12 && m < 24 },
    { k: '2+ yil', f: (m: number) => m >= 24 },
  ].map((b) => ({ k: b.k, n: people.filter((p) => p.hire_date && b.f(monthsBetween(p.hire_date, today))).length }));
  const unknown = people.filter((p) => !p.hire_date).length;
  const maxB = Math.max(1, ...buckets.map((b) => b.n));
  const disciplined = people.filter((p) => p.tasks.onTime !== null);
  const avgOnTime = disciplined.length ? Math.round(disciplined.reduce((a, p) => a + (p.tasks.onTime ?? 0), 0) / disciplined.length) : null;
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className={cn(SURFACE_CARD, 'p-5')}>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-au-ink">
            <Network className="size-4" /> Bo‘limlar tarkibi
          </h3>
          <div className="grid gap-2">
            {byDept.map((x, i) => (
              <div key={x.d} className="grid grid-cols-[110px_1fr_28px] items-center gap-2 text-sm">
                <span className="truncate text-au-ink">{deptLabels[x.d]}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-au-card-2">
                  <span className="ms-fill block h-full rounded-full" style={{ width: `${(x.n / maxD) * 100}%`, background: DEPT_TONE[x.d], animationDelay: `${i * 60}ms` }} />
                </span>
                <b className="text-right text-au-ink tabular-nums">{x.n}</b>
              </div>
            ))}
          </div>
        </div>
        <div className={cn(SURFACE_CARD, 'p-5')}>
          <h3 className="mb-3 text-sm font-bold text-au-ink">Staj taqsimoti</h3>
          <div className="flex h-32 items-end gap-3">
            {buckets.map((b, i) => (
              <div key={b.k} className="flex flex-1 flex-col items-center gap-1">
                <b className="text-sm text-au-ink tabular-nums">{b.n}</b>
                <span className="ms-wave w-full rounded-t-[6px] bg-au-accent" style={{ height: `${Math.max(4, (b.n / maxB) * 88)}px`, ['--i' as string]: i * 2, transformOrigin: 'bottom' }} />
                <span className="text-[11px] text-au-muted">{b.k}</span>
              </div>
            ))}
          </div>
          {unknown > 0 && <p className="mt-2 text-[11px] text-au-faint">{unknown} kishida ishga kirgan sana kiritilmagan</p>}
        </div>
        <div className={cn(SURFACE_CARD, 'flex flex-col justify-center gap-1 p-5')}>
          <Sparkles className="size-5 text-au-accent-text" />
          <div className="text-[11px] font-semibold text-au-muted">Vazifalar o‘z vaqtida (o‘rtacha)</div>
          <div className="text-3xl font-bold text-au-ink tabular-nums">{avgOnTime === null ? '—' : `${avgOnTime}%`}</div>
          <div className="text-xs text-au-muted">{disciplined.length} xodim bo‘yicha</div>
        </div>
      </div>
      {extra}
    </div>
  );
}
