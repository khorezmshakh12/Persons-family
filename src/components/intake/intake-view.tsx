'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  CalendarRange,
  CheckCircle2,
  Clock3,
  FileDown,
  Filter,
  Flame,
  Layers,
  Loader2,
  Minus,
  Plus,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CARD_TITLE, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import {
  deleteIntakeLeadsAction,
  getIntakeAction,
  judgeSourcesWithJevAction,
  logLeadAction,
  setLeadSpendAction,
  setLeadStageAction,
  type SourceVerdict,
} from '@/lib/actions/intake';
import { LOST_REASONS, pct, SOURCE_META, SOURCES, STAGE_LABEL, STAGES, type Funnel, type Source, type Stage } from '@/lib/intake';
import type { Intake, IntakeRange } from '@/lib/intake-data';

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 h-9 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const RANGES: [IntakeRange, string][] = [
  ['week', 'Hafta'],
  ['month', 'Oy'],
  ['quarter', 'Chorak'],
  ['custom', 'Oraliq'],
];
const DAYS = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const ERR: Record<string, string> = { aiDisabled: 'Jev ulanmagan', aiFailed: 'Jev javob bermadi', forbidden: 'Ruxsat yo‘q', invalidInput: 'Ma’lumotni tekshiring' };
const errText = (c: string) => ERR[c] ?? 'Saqlab bo‘lmadi, qayta urinib ko‘ring';

function Card({ title, icon, i = 0, action, children, className }: { title: string; icon: ReactNode; i?: number; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <span className="text-au-muted">{icon}</span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Delta({ now, prev, unit = '' }: { now: number | null; prev: number | null; unit?: '' | 'pp' }) {
  if (now === null || prev === null) return <span className="text-[11px] text-au-muted">—</span>;
  const d = unit === 'pp' ? now - prev : prev ? (now - prev) / prev : now ? 1 : 0;
  if (Math.abs(d) < 0.005) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-au-muted"><Minus className="size-3" /> o‘zgarmadi</span>;
  const up = d > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-bold', up ? 'text-au-ok' : 'text-au-bad')}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {unit === 'pp' ? `${up ? '+' : ''}${Math.round(d)} p.p.` : `${up ? '+' : ''}${Math.round(d * 100)}%`}
    </span>
  );
}

function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const W = 72;
  const H = 22;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * W).toFixed(1)} ${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path d={d} pathLength={1} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" className="ms-draw" />
    </svg>
  );
}

export function IntakeView({ initial, canEdit }: { initial: Intake; canEdit: boolean }) {
  const [data, setData] = useState(initial);
  const [range, setRange] = useState<IntakeRange>(initial.range);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [loading, startLoad] = useTransition();
  const [jev, setJev] = useState<Record<string, SourceVerdict> | null>(null);
  const [jevBusy, startJev] = useTransition();
  const req = useRef(0);

  const reload = (r: IntakeRange, a?: string, b?: string) =>
    startLoad(async () => {
      const id = ++req.current;
      const res = await getIntakeAction(r, a, b);
      if (id !== req.current) return;
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setData(res.intake);
    });

  const askJev = () =>
    startJev(async () => {
      const res = await judgeSourcesWithJevAction();
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setJev(Object.fromEntries(res.verdicts.map((v) => [v.source, v])));
      toast.success('Jev manbalar yo‘nalishini baholadi');
    });

  const { now, prev } = data;
  const tiles: { n: string; v: string; d: ReactNode; hint: string }[] = [
    { n: 'Kelganlar', v: String(now.leads), d: <Delta now={now.leads} prev={prev.leads} />, hint: 'davrda murojaat qilganlar' },
    { n: 'Bog‘lanildi', v: String(now.contacted), d: <Delta now={now.contacted} prev={prev.contacted} />, hint: 'kelganlardan' },
    { n: 'Sinov darsi', v: String(now.trial), d: <Delta now={now.trial} prev={prev.trial} />, hint: 'kelganlardan' },
    { n: 'Yozildi', v: String(now.enrolled), d: <Delta now={now.enrolled} prev={prev.enrolled} />, hint: `davrda jami yozilgan: ${data.enrolledInPeriod}` },
    { n: 'Konversiya', v: pct(now.conv), d: <Delta now={now.conv} prev={prev.conv} unit="pp" />, hint: 'kelgan → yozilgan' },
    { n: 'O‘rtacha muddat', v: now.avgDays === null ? '—' : `${now.avgDays.toFixed(1)} kun`, d: <span className="text-[11px] text-au-muted">murojaatdan yozilishgacha</span>, hint: '' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
          {RANGES.map(([r, n]) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                if (r !== 'custom') reload(r);
              }}
              className={cn('h-8 rounded-[10px] px-3.5 text-sm font-semibold transition', range === r ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
            >
              {n}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="ms-pop-in flex items-center gap-1.5">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={cn(INPUT, 'h-9 w-auto')} />
            <span className="text-au-muted">—</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={cn(INPUT, 'h-9 w-auto')} />
            <button className={BTN_GHOST} onClick={() => reload('custom', from, to)} disabled={!from || !to || from > to}>
              <CalendarRange className="size-4" /> Ko‘rsatish
            </button>
          </div>
        )}
        <span className="text-xs text-au-muted">
          {data.from} — {data.to}
        </span>
        {loading && <Loader2 className="size-4 animate-spin text-au-muted" />}
        <div className="ml-auto flex gap-2">
          <button className={BTN_GHOST} onClick={() => exportCsv(data)}>
            <FileDown className="size-4" /> Excel
          </button>
          <button className={BTN_GHOST} onClick={() => exportPdf(data)}>
            <FileDown className="size-4" /> PDF
          </button>
        </div>
      </div>

      {canEdit && <QuickLog courses={data.courses.map((c) => c.course)} campaigns={data.campaigns} onDone={() => reload(range, from, to)} />}

      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {data.alerts.map((a) => (
            <div
              key={a.id}
              className={cn('ms-pop-in flex items-center gap-2 rounded-au-ctl px-3.5 py-2 text-sm', a.tone === 'risk' ? 'bg-au-bad-soft text-au-ink' : 'bg-au-ok-soft text-au-ink')}
            >
              {a.tone === 'risk' ? <AlertTriangle className="size-4 shrink-0 text-au-bad" /> : <CheckCircle2 className="size-4 shrink-0 text-au-ok" />}
              {a.text}
            </div>
          ))}
        </div>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t, i) => (
          <div key={t.n} style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-1 p-4')}>
            <span className="text-xs font-semibold text-au-muted">{t.n}</span>
            <span className="text-2xl font-bold tabular-nums">
              <CountUp value={t.v} />
            </span>
            {t.d}
            {t.hint && <span className="truncate text-[10px] text-au-muted">{t.hint}</span>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TrendCard data={data} />
          <SourcesCard data={data} jev={jev} jevBusy={jevBusy} onJev={askJev} canEdit={canEdit} onSpend={() => reload(range, from, to)} />
          <div className="grid gap-5 lg:grid-cols-2">
            <CoursesCard data={data} />
            <LostCard data={data} />
          </div>
          <HeatCard heat={data.heat} />
          <CohortCard data={data} />
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <PaceCard data={data} />
          <FunnelCard f={now} />
          <RecentCard data={data} canEdit={canEdit} onChange={() => reload(range, from, to)} />
        </aside>
      </div>
      <p className="text-[11px] text-au-muted">
        Bu bo‘lim qabul statistikasi uchun: o‘quvchilar bilan ishlash (qo‘ng‘iroqlar, eslatmalar) bu yerda yuritilmaydi. Raqamlar Operatsiyalar › Kelganlar va boshqaruv paneli bilan bir manbadan olinadi.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ quick log */

function QuickLog({ courses, campaigns, onDone }: { courses: string[]; campaigns: string[]; onDone: () => void }) {
  // The undo toast outlives this render: always reload with the current view.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const [source, setSource] = useState<Source>('instagram');
  const [course, setCourse] = useState('');
  const [stage, setStage] = useState<Stage>('new');
  const [campaign, setCampaign] = useState('');
  const [count, setCount] = useState(1);
  const [busy, start] = useTransition();

  const submit = () =>
    start(async () => {
      const res = await logLeadAction({ source, course, stage, campaign, count });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      const ids = res.ids;
      toast.success(`${count} ta kelgan qayd etildi`, {
        duration: 6000,
        action: {
          label: 'Bekor qilish',
          onClick: () => {
            void deleteIntakeLeadsAction(ids).then((r) => {
              if (r.error !== undefined) toast.error(errText(r.error));
              else {
                toast.success('Qayd bekor qilindi');
                done.current();
              }
            });
          },
        },
      });
      setCount(1);
      onDone();
    });

  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-bold tracking-wide text-au-muted uppercase">Tez qayd</span>
        {SOURCES.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition', source === s ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
          >
            <i className="size-2 rounded-full" style={{ background: SOURCE_META[s].c }} />
            {SOURCE_META[s].n}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input list="intake-courses" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="Kurs" className={cn(INPUT, 'h-9 w-44')} />
        <datalist id="intake-courses">
          {courses.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={cn(INPUT, 'h-9 w-auto')}>
          {STAGES.filter((s) => s !== 'lost').map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
        <input list="intake-campaigns" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="Kampaniya (ixtiyoriy)" className={cn(INPUT, 'h-9 w-48')} />
        <datalist id="intake-campaigns">
          {campaigns.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="inline-flex h-9 items-center rounded-au-ctl border border-au-line">
          <button className="h-full px-2.5 text-au-muted hover:text-au-ink" onClick={() => setCount(Math.max(1, count - 1))} aria-label="Kamaytirish">
            −
          </button>
          <span className="w-8 text-center text-sm font-bold tabular-nums">{count}</span>
          <button className="h-full px-2.5 text-au-muted hover:text-au-ink" onClick={() => setCount(Math.min(50, count + 1))} aria-label="Ko‘paytirish">
            +
          </button>
        </div>
        <button className={BTN_PRIMARY} disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Qayd etish
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ cards */

function PaceCard({ data }: { data: Intake }) {
  const rows = [
    { n: 'Kelganlar', p: data.leadPace },
    { n: 'Shartnomalar', p: data.wonPace },
  ];
  return (
    <Card title={`Oylik reja · ${data.month}`} icon={<Target className="size-4" />} i={1}>
      {rows.map(({ n, p }) => {
        const ratio = p.target ? Math.min(1, p.actual / p.target) : 0;
        const fr = p.target ? Math.min(1, p.forecast / p.target) : 0;
        const bad = p.pct !== null && p.pct < 80;
        return (
          <div key={n} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <b>{n}</b>
              <span className="tabular-nums">
                <b>{p.actual}</b> <span className="text-au-muted">/ {p.target || '—'}</span>
              </span>
            </div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-au-card-2">
              <i className="absolute inset-y-0 left-0 rounded-full bg-au-ink/15" style={{ width: `${fr * 100}%` }} />
              <i className={cn('ms-fill absolute inset-y-0 left-0 rounded-full', bad ? 'bg-au-bad' : 'bg-au-ok')} style={{ width: `${ratio * 100}%` }} />
            </div>
            <span className="text-[11px] text-au-muted">
              {p.target
                ? `Prognoz: ${p.forecast} (${pct(p.pct)})${p.needPerDay ? ` · rejaga yetish uchun kuniga ~${p.needPerDay.toFixed(1)}` : ''}`
                : 'Reja Platforma › Maqsadlar’da kiritiladi'}
            </span>
          </div>
        );
      })}
    </Card>
  );
}

function FunnelCard({ f }: { f: Funnel }) {
  const steps = [
    { n: 'Kelgan', v: f.leads },
    { n: 'Bog‘lanilgan', v: f.contacted },
    { n: 'Sinov darsi', v: f.trial },
    { n: 'Yozilgan', v: f.enrolled },
  ];
  const max = Math.max(1, f.leads);
  return (
    <Card title="Bosqichlar oqimi" icon={<Filter className="size-4" />} i={2}>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => {
          const drop = i > 0 && steps[i - 1].v ? 100 - (s.v / steps[i - 1].v) * 100 : null;
          return (
            <div key={s.n} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span>{s.n}</span>
                <span className="tabular-nums">
                  <b>{s.v}</b>
                  {drop !== null && drop > 0 && <span className="ml-1.5 text-[11px] text-au-bad">−{Math.round(drop)}%</span>}
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-md bg-au-card-2">
                <i style={{ width: `${(s.v / max) * 100}%`, ['--i' as string]: i }} className="ms-fill block h-full rounded-md bg-au-accent" />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-au-muted">Yo‘qotilgan: {f.lost} · Sinovdan yozilish: {pct(f.trialConv)}</p>
    </Card>
  );
}

function TrendCard({ data }: { data: Intake }) {
  const max = Math.max(1, ...data.trend.map((t) => t.leads));
  return (
    <Card title="8 hafta: kelganlar va yozilganlar" icon={<TrendingUp className="size-4" />} i={0}>
      <div className="flex h-40 items-end gap-2">
        {data.trend.map((t, i) => (
          <div key={t.label} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${t.label}: ${t.leads} kelgan, ${t.enrolled} yozilgan`}>
            <span className="text-[11px] font-bold text-au-muted opacity-0 tabular-nums transition group-hover:opacity-100">{t.leads}</span>
            <div className="relative flex w-full max-w-12 flex-1 items-end">
              <span style={{ height: `${(t.leads / max) * 100}%`, ['--i' as string]: i }} className={cn('ms-grow-y w-full rounded-t-md', i === data.trend.length - 1 ? 'bg-au-accent/70' : 'bg-au-ink/20')} />
              <span style={{ height: `${(t.enrolled / max) * 100}%`, ['--i' as string]: i }} className="ms-grow-y absolute bottom-0 left-1/4 w-1/2 rounded-t-sm bg-au-ok" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-center text-[10px] text-au-muted">
        {data.trend.map((t) => (
          <span key={t.label} className="flex-1">
            {t.label}
          </span>
        ))}
      </div>
      <p className="flex gap-4 text-[11px] text-au-muted">
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-sm bg-au-ink/30" /> Kelganlar
        </span>
        <span className="flex items-center gap-1">
          <i className="size-2 rounded-sm bg-au-ok" /> Yozilganlar
        </span>
      </p>
    </Card>
  );
}

function SourcesCard({ data, jev, jevBusy, onJev, canEdit, onSpend }: { data: Intake; jev: Record<string, SourceVerdict> | null; jevBusy: boolean; onJev: () => void; canEdit: boolean; onSpend: () => void }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(SOURCES.map((s) => [s, String(data.monthSpend[s] ?? '')])));
  const [busy, start] = useTransition();
  const saveSpend = () =>
    start(async () => {
      for (const s of SOURCES) {
        const v = vals[s].replace(/\s/g, '');
        const n = v === '' ? 0 : Number(v);
        if (!Number.isFinite(n) || n < 0) return void toast.error(`${SOURCE_META[s].n}: summa noto‘g‘ri`);
        if (n === (data.monthSpend[s] ?? 0)) continue;
        const res = await setLeadSpendAction({ month: data.month, source: s, amount: n });
        if (res.error !== undefined) {
          onSpend(); // what did save must show
          return void toast.error(errText(res.error));
        }
      }
      toast.success('Xarajatlar saqlandi');
      setEditing(false);
      onSpend();
    });
  const VERDICT = { rising: ['O‘smoqda', CHIP_OK], stable: ['Barqaror', CHIP_NEUTRAL], falling: ['Pasaymoqda', CHIP_BAD] } as const;
  return (
    <Card
      title="Manbalar"
      icon={<Layers className="size-4" />}
      i={1}
      action={
        <div className="flex gap-1.5">
          {canEdit && (
            <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} onClick={() => setEditing(!editing)}>
              Xarajat ({data.month})
            </button>
          )}
          <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} disabled={jevBusy} onClick={onJev}>
            {jevBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />} Jev
          </button>
        </div>
      }
    >
      {editing && (
        <div className="ms-pop-in grid grid-cols-2 gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3 sm:grid-cols-4">
          {SOURCES.map((s) => (
            <label key={s} className="flex flex-col gap-1 text-[11px] font-semibold text-au-muted">
              {SOURCE_META[s].n}
              <input value={vals[s]} onChange={(e) => setVals({ ...vals, [s]: e.target.value })} inputMode="numeric" placeholder="0" className={cn(INPUT, 'h-8 text-sm tabular-nums')} />
            </label>
          ))}
          <div className="col-span-full flex justify-end gap-2">
            <button className={cn(BTN_GHOST, 'h-8 text-xs')} onClick={() => setEditing(false)}>
              Bekor
            </button>
            <button className={cn(BTN_PRIMARY, 'h-8 text-xs')} disabled={busy} onClick={saveSpend}>
              Saqlash
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
              <th className="py-2">Manba</th>
              <th className="py-2 text-right">Kelgan</th>
              <th className="py-2 text-right">Yozilgan</th>
              <th className="py-2 text-right">Konv.</th>
              <th className="py-2 text-right">Xarajat</th>
              <th className="py-2 text-right">1 kelgan</th>
              <th className="py-2 text-right">1 shartnoma</th>
              <th className="py-2 pl-3">8 hafta</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s, i) => {
              const v = jev?.[s.source];
              return (
                <tr key={s.source} style={{ ['--i' as string]: i }} className="ms-rise border-t border-au-line">
                  <td className="py-2">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <i className="size-2.5 rounded-full" style={{ background: SOURCE_META[s.source].c }} />
                      {SOURCE_META[s.source].n}
                      {v && (
                        <span className={VERDICT[v.verdict][1]} title={`Jev ishonchi ${Math.round(v.confidence * 100)}%`}>
                          {VERDICT[v.verdict][0]}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{s.leads}</td>
                  <td className="py-2 text-right tabular-nums">{s.enrolled}</td>
                  <td className="py-2 text-right tabular-nums">{pct(s.conv)}</td>
                  <td className="py-2 text-right tabular-nums">{s.spend ? formatUZS(s.spend) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{s.cpl ? formatUZS(Math.round(s.cpl)) : '—'}</td>
                  <td className="py-2 text-right tabular-nums">{s.cac ? formatUZS(Math.round(s.cac)) : '—'}</td>
                  <td className="py-2 pl-3">
                    <Spark values={s.trend} color={SOURCE_META[s.source].c} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!data.sources.length && <p className="py-4 text-center text-sm text-au-muted">Bu davrda kelgan yo‘q</p>}
      </div>
    </Card>
  );
}

function CoursesCard({ data }: { data: Intake }) {
  const max = Math.max(1, ...data.courses.map((c) => c.leads));
  return (
    <Card title="Kurslar bo‘yicha talab" icon={<Users className="size-4" />} i={2}>
      {data.courses.length === 0 ? (
        <p className="text-sm text-au-muted">Ma’lumot yo‘q</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.courses.slice(0, 10).map((c, i) => (
            <li key={c.course} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold">{c.course}</span>
                <span className="shrink-0 tabular-nums">
                  {c.leads} <span className="text-[11px] text-au-muted">→ {c.enrolled} yozildi</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                <i style={{ width: `${(c.leads / max) * 100}%`, ['--i' as string]: i }} className="ms-fill block h-full rounded-full bg-au-info" />
              </div>
              {c.balance && c.balance.gap > 0 && (
                <span className={cn(CHIP_BAD, 'w-fit')}>
                  Talab oyiga ~{c.balance.demand}, bo‘sh o‘rin {c.balance.freeSeats} — yangi guruh kerak
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function LostCard({ data }: { data: Intake }) {
  const total = data.lost.reduce((a, b) => a + b.n, 0);
  return (
    <Card title="Yo‘qotish sabablari" icon={<AlertTriangle className="size-4" />} i={3}>
      {total === 0 ? (
        <p className="text-sm text-au-muted">Bu davrda yo‘qotilgan yo‘q</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.lost.map((l, i) => (
            <li key={l.reason} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{l.reason}</span>
                <span className="tabular-nums">
                  {l.n} <span className="text-[11px] text-au-muted">({Math.round((l.n / total) * 100)}%)</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-au-card-2">
                <i style={{ width: `${(l.n / total) * 100}%`, ['--i' as string]: i }} className="ms-fill block h-full rounded-full bg-au-bad" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function HeatCard({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00–22:00
  const peak = useMemo(() => {
    let best = { d: 0, h: 0, v: 0 };
    heat.forEach((row, d) => row.forEach((v, h) => v > best.v && (best = { d, h, v })));
    return best;
  }, [heat]);
  return (
    <Card title="Murojaatlar vaqti" icon={<Flame className="size-4" />} i={4} action={peak.v ? <span className={CHIP_INFO}>Eng faol: {DAYS[peak.d]} {String(peak.h).padStart(2, '0')}:00</span> : undefined}>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-[10px]">
          <thead>
            <tr>
              <th />
              {hours.map((h) => (
                <th key={h} className="w-7 font-normal text-au-muted">
                  {h % 2 === 0 ? h : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heat.map((row, d) => (
              <tr key={d}>
                <td className="pr-1.5 text-au-muted">{DAYS[d]}</td>
                {hours.map((h) => {
                  const v = row[h];
                  return (
                    <td
                      key={h}
                      title={`${DAYS[d]} ${h}:00 — ${v}`}
                      style={{ background: v ? `color-mix(in oklab, var(--au-accent) ${Math.round(15 + (v / max) * 85)}%, transparent)` : undefined, ['--i' as string]: d + h }}
                      className={cn('ms-wave size-6 rounded', !v && 'bg-au-card-2')}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-au-muted">Navbatchilikni eng faol soatlarga moslashtirish uchun.</p>
    </Card>
  );
}

function CohortCard({ data }: { data: Intake }) {
  return (
    <Card title="Kohortlar: kelgan oy bo‘yicha yozilish" icon={<Clock3 className="size-4" />} i={5}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
              <th className="py-1.5">Oy</th>
              <th className="py-1.5 text-right">Kelgan</th>
              {[0, 1, 2, 3, 4].map((k) => (
                <th key={k} className="py-1.5 text-center">
                  {k === 0 ? 'Shu oy' : `+${k} oy`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((c) => (
              <tr key={c.month} className="border-t border-au-line">
                <td className="py-1.5 font-semibold tabular-nums">{c.month}</td>
                <td className="py-1.5 text-right tabular-nums">{c.size}</td>
                {c.pct.map((v, k) => (
                  <td key={k} className="p-0.5 text-center">
                    {v === null ? (
                      <span className="text-au-muted">·</span>
                    ) : (
                      <span
                        className="block rounded px-1 py-0.5 text-xs font-semibold tabular-nums"
                        style={{ background: `color-mix(in oklab, var(--au-ok) ${Math.round(Math.min(100, v) * 0.6)}%, transparent)` }}
                      >
                        {Math.round(v)}%
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function RecentCard({ data, canEdit, onChange }: { data: Intake; canEdit: boolean; onChange: () => void }) {
  const [busy, start] = useTransition();
  const [lostFor, setLostFor] = useState<string | null>(null);
  const setStage = (id: string, stage: Stage, lostReason = '') =>
    start(async () => {
      const res = await setLeadStageAction({ id, stage, lostReason });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setLostFor(null);
      onChange();
    });
  return (
    <Card title="Oxirgi kelganlar" icon={<Clock3 className="size-4" />} i={3}>
      <ul className="flex flex-col divide-y divide-au-line">
        {data.recent.map((l) => (
          <li key={l.id} className="flex flex-col gap-1.5 py-2">
            <div className="flex items-center gap-2 text-sm">
              <i className="size-2 shrink-0 rounded-full" style={{ background: SOURCE_META[l.source]?.c ?? '#999' }} />
              <span className="min-w-0 flex-1 truncate">
                {l.course || 'Kurs ko‘rsatilmagan'}
                {l.name && l.name !== '—' && <span className="text-au-muted"> · {l.name}</span>}
              </span>
              <span className="text-[11px] text-au-muted tabular-nums">{new Date(new Date(l.created_at).getTime() + 5 * 3_600_000).toISOString().slice(5, 10).replace('-', '.')}</span>
              {canEdit ? (
                <select
                  value={l.stage}
                  disabled={busy}
                  onChange={(e) => {
                    const s = e.target.value as Stage;
                    if (s === 'lost') setLostFor(l.id);
                    else setStage(l.id, s);
                  }}
                  className={cn(INPUT, 'h-7 w-auto px-2 text-xs')}
                >
                  {STAGES.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={l.stage === 'enrolled' ? CHIP_OK : l.stage === 'lost' ? CHIP_BAD : CHIP_NEUTRAL}>{STAGE_LABEL[l.stage]}</span>
              )}
            </div>
            {lostFor === l.id && (
              <div className="ms-pop-in flex flex-wrap gap-1">
                {LOST_REASONS.map((r) => (
                  <button key={r} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')} onClick={() => setStage(l.id, 'lost', r)}>
                    {r}
                  </button>
                ))}
                <button className="text-xs text-au-muted" onClick={() => setLostFor(null)}>
                  bekor
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!data.recent.length && <p className="text-sm text-au-muted">Hali kelgan qayd etilmagan</p>}
    </Card>
  );
}

/* ------------------------------------------------------------ export */

const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[−–—]/g, '-').replace(/·/g, '-').replace(/→/g, '->');

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function exportCsv(d: Intake) {
  const q = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    ['Manba', 'Kelgan', 'Yozilgan', 'Konversiya %', 'Xarajat', '1 kelgan', '1 shartnoma'].join(','),
    ...d.sources.map((s) => [SOURCE_META[s.source].n, s.leads, s.enrolled, s.conv === null ? '' : Math.round(s.conv), s.spend, s.cpl ? Math.round(s.cpl) : '', s.cac ? Math.round(s.cac) : ''].map(q).join(',')),
  ];
  download(`qabul-${d.from}_${d.to}.csv`, `﻿${lines.join('\n')}`, 'text/csv;charset=utf-8;');
}

async function exportPdf(d: Intake) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFillColor(27, 31, 42);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(14);
  doc.text('Persons Education - Qabul statistikasi', 14, 13);
  doc.setFontSize(9);
  doc.text(`${d.from} - ${d.to}`, 283, 13, { align: 'right' });
  doc.setTextColor(20);
  autoTable(doc, {
    startY: 30,
    head: [["Kelgan", "Bog'lanilgan", 'Sinov', 'Yozilgan', 'Konversiya', "O'rtacha kun"]],
    body: [[d.now.leads, d.now.contacted, d.now.trial, d.now.enrolled, pct(d.now.conv), d.now.avgDays === null ? '-' : d.now.avgDays.toFixed(1)]],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [['Manba', 'Kelgan', 'Yozilgan', 'Konv.', 'Xarajat', '1 kelgan', '1 shartnoma']],
    body: d.sources.map((s) => [latin(SOURCE_META[s.source].n), s.leads, s.enrolled, pct(s.conv), s.spend || '-', s.cpl ? Math.round(s.cpl) : '-', s.cac ? Math.round(s.cac) : '-']),
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 8 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    head: [['Kurs', 'Kelgan', 'Yozilgan']],
    body: d.courses.slice(0, 15).map((c) => [latin(c.course), c.leads, c.enrolled]),
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 8 },
  });
  doc.save(`qabul-${d.from}_${d.to}.pdf`);
}
