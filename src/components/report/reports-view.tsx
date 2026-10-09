'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  Bot,
  CheckCircle2,
  FileDown,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Minus,
  Share2,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { CARD_TITLE, CHIP_ACCENT, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import {
  addReportNoteAction,
  deleteReportNoteAction,
  deleteSavedReportAction,
  getTeamReportAction,
  rankInsightsWithJevAction,
  saveReportAction,
  type RankedInsight,
  type SavedReport,
} from '@/lib/actions/team-report';
import { change, fmtMetric, METRIC_META, METRICS, RANGE_LABEL, RANGES, type Metric, type Range, type ReportConfig } from '@/lib/team-report';
import type { TeamReport } from '@/lib/team-report-data';

const DEPT_OPTS: [string, string][] = [
  ['', 'Butun jamoa'],
  ['top', 'Rahbariyat'],
  ['acad', 'Akademik'],
  ['com', 'Tijorat'],
  ['ops', 'Operatsiya'],
  ['fin', 'Moliya'],
  ['hr', 'HR'],
];

const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 h-9 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');

const ERR: Record<string, string> = { aiDisabled: 'Jev ulanmagan', aiFailed: 'Jev javob bermadi', forbidden: 'Ruxsat yo‘q', invalidInput: 'Ma’lumotni tekshiring' };
const errText = (c: string) => ERR[c] ?? 'Yuklab bo‘lmadi, qayta urinib ko‘ring';

function deltaText(d: number | null, unit: string) {
  if (d === null) return '—';
  if (unit === '%') return `${d > 0 ? '+' : ''}${Math.round(d)} p.p.`;
  return `${d > 0 ? '+' : ''}${Math.round(d * 100)}%`;
}

function tone(d: number | null, good: 'up' | 'down') {
  if (d === null || Math.abs(d) < 0.005) return 'flat';
  return (d > 0) === (good === 'up') ? 'good' : 'bad';
}

export function ReportsView({ initial, saved, me }: { initial: TeamReport; saved: SavedReport[]; me: string }) {
  const [rep, setRep] = useState(initial);
  const [range, setRange] = useState<Range>(initial.range);
  const [dept, setDept] = useState<string>(initial.dept ?? '');
  const [metric, setMetric] = useState<Metric>('onTime');
  const [loading, startLoad] = useTransition();
  const [jevBusy, startJev] = useTransition();
  const [ranked, setRanked] = useState<Record<string, RankedInsight> | null>(null);
  const [custom, setCustom] = useState<SavedReport | null>(null);

  // Only the latest request may land (fast range/department switching).
  const reqId = useRef(0);
  const load = (r: Range, d: string) =>
    startLoad(async () => {
      const id = ++reqId.current;
      const res = await getTeamReportAction(r, d || null);
      if (id !== reqId.current) return;
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setRep(res.report);
      setRanked(null);
    });

  const rankJev = () =>
    startJev(async () => {
      const res = await rankInsightsWithJevAction(range, dept || null);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setRanked(Object.fromEntries(res.ranked.map((x) => [x.id, x])));
      toast.success('Jev xulosalarni muhimligi bo‘yicha saraladi');
    });

  const labels = rep.buckets.map((b) => b.label);
  const order = { high: 0, medium: 1, low: 2 } as const;
  const insights = ranked
    ? [...rep.insights].sort((a, b) => (order[ranked[a.id]?.priority ?? 'low'] ?? 2) - (order[ranked[b.id]?.priority ?? 'low'] ?? 2))
    : rep.insights;
  const shownMetrics = custom ? custom.config.metrics : (METRICS as readonly Metric[]);

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRange(r);
                load(r, dept);
              }}
              className={cn('h-8 rounded-[10px] px-3.5 text-sm font-semibold transition', range === r ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
        <select
          value={dept}
          onChange={(e) => {
            setDept(e.target.value);
            load(range, e.target.value);
          }}
          className={cn(INPUT, 'h-10 w-auto')}
        >
          {DEPT_OPTS.map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
        {loading && <Loader2 className="size-4 animate-spin text-au-muted" />}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className={BTN_GHOST} onClick={() => exportPdf(rep, shownMetrics, custom?.name)}>
            <FileDown className="size-4" /> PDF
          </button>
        </div>
      </div>

      {custom && (
        <div className="ms-pop-in flex items-center gap-2 rounded-au-ctl bg-au-accent-soft px-3.5 py-2 text-sm">
          <Bookmark className="size-4 text-au-accent-text" />
          <span>
            Saqlangan hisobot: <b>{custom.name}</b> — {custom.config.metrics.length} ko‘rsatkich
          </span>
          <button className="ml-auto text-au-muted hover:text-au-ink" onClick={() => setCustom(null)} aria-label="Yopish">
            <X className="size-4" />
          </button>
        </div>
      )}

      {(rep.missing.selfDev > 0 || rep.missing.kpiPlan > 0) && (
        <p className="flex items-center gap-2 rounded-au-ctl bg-au-card-2 px-3.5 py-2 text-xs text-au-muted">
          <AlertTriangle className="size-3.5" />
          Ma’lumot to‘liq emas: {rep.missing.selfDev} xodim bu oy o‘zini rivojlantirish hisobotini, {rep.missing.kpiPlan} xodim keyingi oy KPI rejasini topshirmagan.
        </p>
      )}

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {shownMetrics.map((m, i) => {
          const meta = METRIC_META[m];
          const vals = rep.series[m];
          const v = vals[vals.length - 1];
          const d = change(vals, meta.unit);
          const t = tone(d, meta.good);
          return (
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{ ['--i' as string]: i }}
              className={cn(
                SURFACE_CARD,
                'ms-rise flex flex-col gap-1.5 p-4 text-left transition hover:-translate-y-0.5',
                metric === m && 'ring-2 ring-au-accent',
              )}
            >
              <span className="text-xs font-semibold text-au-muted">{meta.n}</span>
              <span className="text-2xl font-bold tabular-nums">
                <CountUp value={fmtMetric(v, meta.unit)} />
              </span>
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-[11px] font-bold',
                    t === 'good' ? 'text-au-ok' : t === 'bad' ? 'text-au-bad' : 'text-au-muted',
                  )}
                >
                  {d === null || t === 'flat' ? <Minus className="size-3" /> : d > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {deltaText(d, meta.unit)}
                </span>
                <Spark values={vals} tone={t} />
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-5">
          <TrendCard rep={rep} metric={metric} labels={labels} me={me} onNotes={(f) => setRep((r) => ({ ...r, notes: f(r.notes) }))} />

          {/* Departments */}
          <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 3 }}>
            <h3 className={CARD_TITLE}>Bo‘limlar kesimi · {labels[labels.length - 1]}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
                    <th className="py-2">Bo‘lim</th>
                    <th className="py-2 text-right">Xodim</th>
                    <th className="py-2 text-right">Bajarilgan</th>
                    <th className="py-2 text-right">O‘z vaqtida</th>
                    <th className="py-2 text-right">Muddati o‘tgan</th>
                    <th className="py-2 text-right">O‘zini riv.</th>
                    <th className="py-2 text-right">KPI</th>
                  </tr>
                </thead>
                <tbody>
                  {rep.depts.map((d, i) => (
                    <tr key={d.dept} className="ms-rise border-t border-au-line" style={{ ['--i' as string]: i }}>
                      <td className="py-2 font-semibold">{d.dept}</td>
                      <td className="py-2 text-right tabular-nums">{d.people}</td>
                      <td className="py-2 text-right tabular-nums">{d.tasksDone}</td>
                      <Heat v={d.onTime} lo={60} hi={85} unit="%" />
                      <Heat v={d.overdueNow} lo={3} hi={0} unit="" invert />
                      <Heat v={d.selfDevRate} lo={50} hi={85} unit="%" />
                      <Heat v={d.kpiAvg} lo={-1} hi={5} unit="%" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Attention */}
          <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 4 }}>
            <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
              <UserRound className="size-4 text-au-muted" /> E’tibor kerak {rep.attention.length > 0 && <span className={CHIP_BAD}>{rep.attention.length}</span>}
            </h3>
            {rep.attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-au-ok">
                <CheckCircle2 className="size-4" /> Hammasi joyida
              </p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {rep.attention.slice(0, 16).map((a, i) => (
                  <li key={a.staffId} style={{ ['--i' as string]: i }} className="ms-rise">
                    <Link href={`/profile/${a.staffId}`} className="flex flex-col gap-1 rounded-au-ctl border border-au-line p-2.5 transition hover:bg-au-card-2">
                      <span className="flex items-center justify-between gap-2">
                        <b className="truncate text-sm">{a.name}</b>
                        <span className={CHIP_NEUTRAL}>{a.dept}</span>
                      </span>
                      <span className="text-[11px] text-au-muted">{a.reasons.join(' · ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {/* Insights */}
          <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 2 }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
                <Lightbulb className="size-4 text-au-muted" /> Xulosa
              </h3>
              <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} disabled={jevBusy || !rep.insights.length} onClick={rankJev}>
                {jevBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Bot className="size-3.5" />} Jev saralasin
              </button>
            </div>
            {insights.length === 0 ? (
              <p className="text-sm text-au-muted">Bu davrda sezilarli o‘zgarish yo‘q</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {insights.map((x, i) => {
                  const r = ranked?.[x.id];
                  return (
                    <li
                      key={x.id}
                      style={{ ['--i' as string]: i }}
                      className={cn(
                        'ms-rise flex items-start gap-2 rounded-au-ctl border-l-[3px] bg-au-card-2 px-3 py-2 text-sm',
                        x.tone === 'good' ? 'border-au-ok' : x.tone === 'risk' ? 'border-au-bad' : 'border-au-accent',
                      )}
                    >
                      <span className="flex-1">
                        {x.text}
                        {x.metric && (
                          <Link href={METRIC_META[x.metric].href} className="ml-1 text-xs font-semibold text-au-muted underline-offset-2 hover:underline">
                            ochish
                          </Link>
                        )}
                      </span>
                      {r && (
                        <span className={r.priority === 'high' ? CHIP_BAD : r.priority === 'medium' ? CHIP_ACCENT : CHIP_NEUTRAL} title={`Jev ishonchi ${Math.round(r.confidence * 100)}%`}>
                          {r.priority === 'high' ? 'Shoshilinch' : r.priority === 'medium' ? 'Muhim' : 'Ma’lumot'}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-[11px] text-au-muted">Xulosalar raqamlardan qoida asosida tuziladi; Jev faqat qaysi biri shoshilinch ekanini baholaydi.</p>
          </section>

          <Builder
            saved={saved}
            range={range}
            dept={dept}
            onApply={(s) => {
              setCustom(s);
              setRange(s.config.range);
              setDept(s.config.dept ?? '');
              if (s.config.metrics[0]) setMetric(s.config.metrics[0]);
              load(s.config.range, s.config.dept ?? '');
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function Heat({ v, lo, hi, unit, invert }: { v: number | null; lo: number; hi: number; unit: string; invert?: boolean }) {
  let cls = '';
  if (v !== null) {
    const good = invert ? v <= hi : v >= hi;
    const bad = invert ? v >= lo : v < lo;
    cls = good ? 'bg-au-ok-soft text-au-ok' : bad ? 'bg-au-bad-soft text-au-bad' : 'bg-au-card-2';
  }
  return (
    <td className="py-1.5 pl-2 text-right">
      <span className={cn('inline-block min-w-12 rounded-md px-2 py-0.5 font-semibold tabular-nums', cls)}>{fmtMetric(v, unit)}</span>
    </td>
  );
}

function Spark({ values, tone: t }: { values: (number | null)[]; tone: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter(([, v]) => v !== null) as [number, number][];
  if (pts.length < 2) return <span className="h-6 w-16" />;
  const ys = pts.map(([, v]) => v);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const W = 64;
  const H = 22;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <path d={d} pathLength={1} fill="none" strokeWidth={1.75} strokeLinecap="round" className="ms-draw" stroke={t === 'good' ? 'var(--au-ok)' : t === 'bad' ? 'var(--au-bad)' : 'var(--au-muted)'} />
    </svg>
  );
}

function TrendCard({
  rep,
  metric,
  labels,
  me,
  onNotes,
}: {
  rep: TeamReport;
  metric: Metric;
  labels: string[];
  me: string;
  onNotes: (f: (n: TeamReport['notes']) => TeamReport['notes']) => void;
}) {
  const meta = METRIC_META[metric];
  const vals = rep.series[metric];
  const [sel, setSel] = useState<number>(vals.length - 1);
  const [note, setNote] = useState('');
  const [busy, start] = useTransition();
  const nums = vals.map((v) => v ?? 0);
  const max = Math.max(1, ...nums.map(Math.abs));
  const notesFor = (i: number) => rep.notes.filter((n) => n.metric === metric && n.week === rep.buckets[i].start);
  const selNotes = notesFor(sel);

  const add = () =>
    start(async () => {
      const res = await addReportNoteAction({ metric, week: rep.buckets[sel].start, body: note.trim() });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      const row = { id: res.id, metric, week: rep.buckets[sel].start, body: note.trim(), author: 'Siz' };
      onNotes((n) => [...n, row]);
      setNote('');
    });
  const del = (id: string) =>
    start(async () => {
      const res = await deleteReportNoteAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      onNotes((n) => n.filter((x) => x.id !== id));
    });

  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 1 }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={CARD_TITLE}>{meta.n}</h3>
        <span className="text-xs text-au-muted">{meta.hint}</span>
      </div>
      <div className="flex h-44 items-end gap-2">
        {vals.map((v, i) => {
          const h = v === null ? 0 : Math.max(3, (Math.abs(v) / max) * 100);
          const has = notesFor(i).length > 0;
          return (
            <button key={rep.buckets[i].key} onClick={() => setSel(i)} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className={cn('text-[11px] font-bold tabular-nums transition', sel === i ? 'text-au-ink' : 'text-au-muted opacity-0 group-hover:opacity-100')}>
                {fmtMetric(v, meta.unit)}
              </span>
              <span
                style={{ height: `${h}%`, ['--i' as string]: i }}
                className={cn(
                  'ms-grow-y relative w-full max-w-12 rounded-t-md transition-colors',
                  sel === i ? 'bg-au-accent' : i === vals.length - 1 ? 'bg-au-ink/60' : 'bg-au-ink/20 group-hover:bg-au-ink/35',
                )}
              >
                {has && <i className="absolute -top-2 left-1/2 size-2 -translate-x-1/2 rounded-full bg-au-info ring-2 ring-au-card" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 text-center text-[10px] text-au-muted">
        {labels.map((l, i) => (
          <span key={i} className={cn('flex-1', sel === i && 'font-bold text-au-ink')}>
            {l}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2 border-t border-au-line pt-3">
        <span className="text-xs font-semibold text-au-muted">{labels[sel]} uchun izohlar</span>
        {selNotes.map((n) => (
          <div key={n.id} className="flex items-start gap-2 rounded-au-ctl bg-au-info-soft px-3 py-1.5 text-sm">
            <span className="flex-1">
              {n.body} <span className="text-[11px] text-au-muted">— {n.author ?? 'Noma’lum'}</span>
            </span>
            {(n.author === 'Siz' || n.author === me) && (
              <button onClick={() => del(n.id)} className="text-au-muted hover:text-au-bad" aria-label="O‘chirish">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: bayram haftasi edi" className={cn(INPUT, 'h-9 flex-1')} />
          <button className={cn(BTN_GHOST, 'h-9')} disabled={busy || note.trim().length < 2} onClick={add}>
            <MessageSquarePlus className="size-4" /> Izoh
          </button>
        </div>
      </div>
    </section>
  );
}

function Builder({ saved, range, dept, onApply }: { saved: SavedReport[]; range: Range; dept: string; onApply: (s: SavedReport) => void }) {
  const [list, setList] = useState(saved);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Metric[]>(['tasksDone', 'onTime', 'missed']);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [busy, start] = useTransition();
  const config: ReportConfig = useMemo(() => ({ metrics: pick, range, dept: dept || null }), [pick, range, dept]);

  const save = () =>
    start(async () => {
      const res = await saveReportAction({ name: name.trim(), config, shared });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      const s: SavedReport = { id: res.id, name: name.trim(), config, shared, mine: true };
      setList([s, ...list]);
      setOpen(false);
      setName('');
      toast.success('Hisobot saqlandi');
      onApply(s);
    });
  const del = (id: string) =>
    start(async () => {
      const res = await deleteSavedReportAction(id);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setList(list.filter((x) => x.id !== id));
    });

  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 5 }}>
      <div className="flex items-center justify-between">
        <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
          <Bookmark className="size-4 text-au-muted" /> Mening hisobotlarim
        </h3>
        {!open && (
          <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} onClick={() => setOpen(true)}>
            Yangi
          </button>
        )}
      </div>
      {open && (
        <div className="ms-pop-in flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nomi (masalan: Akademik haftalik)" className={INPUT} />
          <div className="flex flex-wrap gap-1">
            {METRICS.map((m) => (
              <button
                key={m}
                onClick={() => setPick(pick.includes(m) ? pick.filter((x) => x !== m) : [...pick, m])}
                className={cn('h-7 rounded-full px-2.5 text-xs font-semibold', pick.includes(m) ? 'bg-au-ink text-au-card' : 'bg-au-card text-au-muted')}
              >
                {METRIC_META[m].n}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-au-muted">
            Davr: {RANGE_LABEL[range]} · {DEPT_OPTS.find(([v]) => v === dept)?.[1]} (yuqoridagi tanlovdan olinadi)
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} /> Rahbariyat bilan ulashish
          </label>
          <div className="flex justify-end gap-2">
            <button className="h-8 px-3 text-xs font-semibold text-au-muted" onClick={() => setOpen(false)}>
              Bekor
            </button>
            <button className={cn(BTN_PRIMARY, 'h-8 text-xs')} disabled={busy || name.trim().length < 2 || !pick.length} onClick={save}>
              Saqlash
            </button>
          </div>
        </div>
      )}
      {list.length === 0 && !open ? (
        <p className="text-sm text-au-muted">Ko‘rsatkichlarni tanlab, o‘z hisobotingizni saqlang</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-au-ctl border border-au-line px-2.5 py-2">
              <button className="flex min-w-0 flex-1 flex-col text-left" onClick={() => onApply(s)}>
                <span className="truncate text-sm font-semibold">{s.name}</span>
                <span className="text-[11px] text-au-muted">
                  {RANGE_LABEL[s.config.range]} · {s.config.metrics.length} ko‘rsatkich
                </span>
              </button>
              {s.shared && (
                <span className={CHIP_INFO} title="Ulashilgan">
                  <Share2 className="size-3" />
                </span>
              )}
              {s.mine && (
                <button onClick={() => del(s.id)} className="text-au-muted hover:text-au-bad" aria-label="O‘chirish">
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[−–—]/g, '-').replace(/·/g, '-');

async function exportPdf(rep: TeamReport, metrics: readonly Metric[], title?: string) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFillColor(27, 31, 42);
  doc.rect(0, 0, 297, 22, 'F');
  doc.setTextColor(255);
  doc.setFontSize(14);
  doc.text(latin(`Persons Education - ${title ?? 'Jamoa hisoboti'}`), 14, 13);
  doc.setFontSize(9);
  doc.text(latin(`${RANGE_LABEL[rep.range]} kesimi - ${rep.generatedAt.slice(0, 10)}`), 283, 13, { align: 'right' });
  doc.setTextColor(20);
  autoTable(doc, {
    startY: 30,
    head: [['Ko\'rsatkich', ...rep.buckets.map((b) => latin(b.label)), "O'zgarish"]],
    body: metrics.map((m) => [
      latin(METRIC_META[m].n),
      ...rep.series[m].map((v) => fmtMetric(v, METRIC_META[m].unit)),
      latin(deltaText(change(rep.series[m], METRIC_META[m].unit), METRIC_META[m].unit)),
    ]),
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 8 },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (rep.insights.length) {
    autoTable(doc, {
      startY: y,
      head: [['Xulosa']],
      body: rep.insights.map((x) => [latin(x.text)]),
      headStyles: { fillColor: [45, 52, 70] },
      styles: { fontSize: 8 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }
  autoTable(doc, {
    startY: y,
    head: [["Bo'lim", 'Xodim', 'Bajarilgan', "O'z vaqtida", "Muddati o'tgan", "O'zini riv.", 'KPI']],
    body: rep.depts.map((d) => [latin(d.dept), d.people, d.tasksDone, fmtMetric(d.onTime, '%'), d.overdueNow, fmtMetric(d.selfDevRate, '%'), fmtMetric(d.kpiAvg, '%')]),
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 8 },
  });
  doc.save(`hisobot-${rep.range}-${rep.generatedAt.slice(0, 10)}.pdf`);
}
