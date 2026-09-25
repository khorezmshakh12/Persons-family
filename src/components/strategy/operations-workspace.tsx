'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Filter, Grid3x3, Pencil, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { computeKpiScore } from '@/lib/kpi';
import { addMonths, fmtGrowth, fmtMln, growthRate, monthlySeries } from '@/lib/accounting';
import type { Books } from '@/lib/accounting-data';
import { MONF } from '@/lib/strategy';
import { tashkentDayKey } from '@/lib/time';
import { deleteLeadAction, saveLeadAction } from '@/lib/actions/operations';
import { SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { Chart, HBars } from './charts';
import { MonthPicker } from './view-finance';
import { SC_KEYS, type OpsPlan, type ScKey } from '@/lib/ops-plan';
import { DeptKpi, OpsTop, PlanFunnel, PlanModal, RoomRegister, SlotModal, Trajectory, buildModel, type Cell, type Cohort, type OpsModel } from './operations-plan';
import './strategy.css';
import './suite.css';

export type Stage = 'new' | 'contacted' | 'trial' | 'enrolled' | 'lost';
export type Source = 'instagram' | 'telegram' | 'referral' | 'walkin' | 'website' | 'other';
export type OpsData = {
  groups: { id: string; name: string; course: string; schedule_type: 'odd' | 'even' | null; time: string; room: string; teacher: string; enrolled: number | null }[];
  leads: { id: string; name: string; phone: string; source: Source; course: string; stage: Stage; note: string; created_at: string; enrolled_at: string | null; ai_intent?: number | null; ai_hot?: number | null }[];
  staff: { id: string; name: string; role: string }[];
  metrics: { id: string; staff_id: string; name: string; weight_percentage: number }[];
  entries: { metric_id: string; month: string; target_value: number; actual_value: number | null }[];
  rooms: { code: string; title: string; capacity: number; note: string }[];
  holds: { id: string; room: string; time: string; cohort: 'odd' | 'even'; kind: 'trial' | 'buffer'; title: string }[];
  plan: OpsPlan;
};

type Tab = 'cap' | 'fun' | 'gro' | 'kpi';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'cap', n: 'Xonalar matritsasi', Icon: Grid3x3 },
  { v: 'fun', n: 'Lid voronkasi', Icon: Filter },
  { v: 'gro', n: "O'sish traektoriyasi", Icon: TrendingUp },
  { v: 'kpi', n: "Bo'limlar KPI", Icon: Target },
];
const STAGES: { k: Stage; n: string; c: string }[] = [
  { k: 'new', n: 'Yangi', c: '#b9b2a6' },
  { k: 'contacted', n: "Bog'lanildi", c: '#2477c9' },
  { k: 'trial', n: 'Sinov darsi', c: '#ff9f1c' },
  { k: 'enrolled', n: "O'qishga yozildi", c: '#139a52' },
  { k: 'lost', n: "Yo'qotildi", c: '#c7322b' },
];
const SOURCES: { k: Source; n: string; c: string }[] = [
  { k: 'instagram', n: 'Instagram', c: '#e8567a' },
  { k: 'telegram', n: 'Telegram', c: '#2477c9' },
  { k: 'referral', n: 'Tavsiya', c: '#139a52' },
  { k: 'walkin', n: 'O‘zi keldi', c: '#ff9f1c' },
  { k: 'website', n: 'Veb-sayt', c: '#7a5af8' },
  { k: 'other', n: 'Boshqa', c: '#b9b2a6' },
];
const ROLE_GROUP: Record<string, string> = {
  teacher: "O'qituvchilar",
  head_teacher: "O'qituvchilar",
  assistant: "O'qituvchilar",
  mmd: 'Media (MMD)',
  admin_manager: "Ma'muriyat",
  internship: 'Amaliyotchilar',
  it_developer: 'IT',
  project_manager: 'Loyiha boshqaruvi',
  ceo: 'Rahbariyat',
};
const KEY = 'persons-ops-tab';
const SC_KEY = 'persons-ops-sc';
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Tashkent 'YYYY-MM-DD' of a timestamptz string (the raw value is UTC, so
 * `.slice()` on it put 00:00–05:00 Tashkent on the previous day / month). */
const tzDay = (s: string) => tashkentDayKey(new Date(s));

export function OperationsWorkspace({ data, books, today }: { data: OpsData; books: Books; today: string }) {
  const [tab, setTab] = useState<Tab>('cap');
  const [sc, setSc] = useState<ScKey>('average');
  const [planOpen, setPlanOpen] = useState(false);
  const m = useMemo(() => buildModel(data, books, today, sc), [data, books, today, sc]);
  const pickSc = (v: ScKey) => {
    setSc(v);
    playSound('tick');
    try {
      localStorage.setItem(SC_KEY, v);
    } catch {}
  };
  const openPlan = () => setPlanOpen(true);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      if (v && TABS.some((t) => t.v === v)) setTab(v);
      const c = localStorage.getItem(SC_KEY) as ScKey | null;
      if (c && SC_KEYS.includes(c)) setSc(c);
    } catch {}
  }, []);
  const go = (v: string) => {
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const scheduled = data.groups.filter((g) => g.room && g.time && g.schedule_type);
  const items: PaletteItem[] = [
    { g: 'Amallar', t: "Yangi lid qo'shish", run: () => go('fun') },
    { g: 'Amallar', t: 'Reja sozlamalari', run: openPlan },
    ...data.leads.slice(0, 50).map((l) => ({ g: 'Lidlar', t: l.name, sub: STAGES.find((s) => s.k === l.stage)?.n, run: () => go('fun') })),
    ...data.groups.map((g) => ({ g: 'Guruhlar', t: g.name, sub: [g.room, g.time].filter(Boolean).join(' · '), run: () => go('cap') })),
  ];
  return (
    <SuiteShell section="ops" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Operatsiya HQ · guruhlar, lidlar, KPI"
          title="Operatsiya"
          em="HQ"
          pill={`${data.groups.length} guruh · ${scheduled.length} tasi jadvalda`}
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div className="sx-grid">
          <OpsTop m={m} onSc={pickSc} onPlan={openPlan} />
        </div>
        <div key={tab} className="sx-fade">
          {tab === 'cap' && <Rooms data={data} m={m} />}
          {tab === 'fun' && <Funnel leads={data.leads} m={m} onPlan={openPlan} />}
          {tab === 'gro' && <Growth data={data} books={books} today={today} m={m} onPlan={openPlan} />}
          {tab === 'kpi' && <Kpi data={data} today={today} />}
        </div>
        {planOpen && <PlanModal plan={data.plan} leads={data.leads} onClose={() => setPlanOpen(false)} />}
      </section>
    </SuiteShell>
  );
}

/* ------------------------------------------------------------------- rooms */
const isIelts = (g: OpsData['groups'][number]) => /ielts/i.test(`${g.course} ${g.name}`);
function Rooms({ data, m }: { data: OpsData; m: OpsModel }) {
  const { groups, holds } = data;
  const [coh, setCoh] = useState<Cohort>('odd');
  const [roomF, setRoomF] = useState('all');
  const [open, setOpen] = useState<{ room: string; time: string } | null>(null);
  const ok = groups.filter((g) => g.room && g.time && g.schedule_type);
  const { rooms, times } = m;
  const shown = roomF === 'all' ? rooms : rooms.filter((r) => r === roomF);
  const info = (r: string) => data.rooms.find((x) => x.code === r);
  const cellOf = (room: string, time: string): Cell => {
    const gs = ok.filter((g) => g.room === room && g.time === time && g.schedule_type === coh);
    if (gs.length) return { kind: 'group', g: gs[0], clash: gs.length };
    const h = holds.find((x) => x.room === room && x.time === time && x.cohort === coh);
    return h ? { kind: 'hold', h } : { kind: 'free' };
  };
  const cells = rooms.flatMap((r) => times.map((t) => cellOf(r, t)));
  const gCells = cells.filter((c) => c.kind === 'group');
  const cohGroups = ok.filter((g) => g.schedule_type === coh);
  const trials = holds.filter((h) => h.cohort === coh && h.kind === 'trial').length;
  const buffers = holds.filter((h) => h.cohort === coh && h.kind === 'buffer').length;
  const free = cells.filter((c) => c.kind === 'free').length;
  const util = cells.length ? (gCells.length / cells.length) * 100 : 0;
  const counted = cohGroups.filter((g) => g.enrolled != null);
  const seats = counted.reduce((a, g) => a + (g.enrolled ?? 0), 0);
  const clashes = cells.filter((c) => c.kind === 'group' && c.clash > 1).length;
  const missing = groups.filter((g) => !(g.room && g.time && g.schedule_type));
  const load = (t: string) => rooms.filter((r) => cellOf(r, t).kind === 'group').length;
  const peakN = Math.max(0, ...times.map(load));
  const C = 2 * Math.PI * 42;
  const cohName = coh === 'odd' ? 'Toq kunlar' : 'Juft kunlar';
  const cls = (c: Cell) => (c.kind === 'group' ? (isIelts(c.g) ? 'ie' : 'gr') : c.kind === 'hold' ? (c.h.kind === 'trial' ? 'tr' : 'bf') : '');
  const sel = open ? cellOf(open.room, open.time) : null;
  return (
    <div className="sx-grid">
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Quvvat bandligi</h3>
          <small>{cohName} · guruh slotlari / jami slotlar</small>
        </div>
        <div className="sx-gauge">
          <svg viewBox="0 0 100 100" width={150} height={150}>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--au-card-2)" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--au-ink)" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(util / 100) * C} ${C}`} />
          </svg>
          <div className="c">
            <b>{cells.length ? `${util.toFixed(1)}%` : '—'}</b>
            <small>bandlik</small>
          </div>
        </div>
        <div className="text-center">
          <span className={cn('sx-pl', util <= 85 ? 'ok' : 'warn')}>{util <= 85 ? 'Lean optimal · Kingman xavfsiz zonasi' : 'Yuqori yuklama · navbat xavfi (>85%)'}</span>
          <p className="mt-2 text-xs text-au-muted">
            {buffers} bufer slot zaxirada · {free} katak bo‘sh{clashes ? ` · ${clashes} to‘qnashuv` : ''}
          </p>
        </div>
      </div>
      <div className="s8 grid grid-cols-2 gap-[18px] lg:grid-cols-4">
        <div className="sx-card sx-stat dark">
          <div className="l">Faol guruhlar</div>
          <div className="v">{cohGroups.length}</div>
          <div className="d">{counted.length ? `${seats} o‘rin band · o‘rtacha ${(seats / counted.length).toFixed(1)} o‘q.` : 'o‘quvchi soni kiritilmagan'}</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Nazariy maksimum</div>
          <div className="v">{m.maxSeats}</div>
          <div className="d">{rooms.length * times.length * 2} guruh sloti × sig‘im (2 kohorta)</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Sinov darslari</div>
          <div className="v">{trials}</div>
          <div className="d">trial slotlar · sotuv bilan</div>
        </div>
        <div className="sx-card sx-stat">
          <div className="l">Lean bufer</div>
          <div className="v">{buffers}</div>
          <div className="d">makeup, klub, audit, zaxira</div>
        </div>
        <div className="sx-card col-span-2 lg:col-span-4">
          <div className="sx-h">
            <h3>Xonalar kesimida bandlik</h3>
            <small>{cohName}</small>
          </div>
          {rooms.length === 0 ? (
            <div className="sx-empty">—</div>
          ) : (
            rooms.map((r) => {
              const g = times.filter((t) => cellOf(r, t).kind === 'group').length;
              const p = times.length ? (g / times.length) * 100 : 0;
              return (
                <div key={r} className="sx-rmr">
                  <span className="truncate">{info(r)?.title || r}</span>
                  <div className="sx-hb">
                    <i style={{ width: `${p}%`, background: p >= 85 ? 'var(--au-accent)' : 'var(--au-ink)' }} />
                  </div>
                  <b>
                    {g}/{times.length}
                  </b>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Darslar matritsasi</h3>
          <small>
            {rooms.length} auditoriya × {times.length} slot{times.length ? ` · ${times[0]}–${times[times.length - 1]}` : ''}
          </small>
          <span className="sp" />
          <div className="sx-seg">
            <button className={cn(coh === 'odd' && 'on')} onClick={() => setCoh('odd')}>
              Toq kunlar · Du-Chor-Ju
            </button>
            <button className={cn(coh === 'even' && 'on')} onClick={() => setCoh('even')}>
              Juft kunlar · Se-Pay-Sha
            </button>
          </div>
          <select className="sx-inp !h-[32px] !w-[200px]" value={roomF} onChange={(e) => setRoomF(e.target.value)} aria-label="Xona filtri">
            <option value="all">Barcha xonalar ({rooms.length})</option>
            {rooms.map((r) => (
              <option key={r} value={r}>
                {info(r)?.title ? `${info(r)?.title} (${r})` : r}
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-au-muted">
          {[
            ['Faol guruh', 'var(--au-primary)'],
            ['IELTS guruh', 'var(--au-info)'],
            ['Sinov darsi', 'var(--au-accent)'],
            ['Lean bufer', 'var(--au-chart-4)'],
          ].map(([n, c]) => (
            <span key={n}>
              <i className="sx-sw" style={{ background: c }} />
              {n}
            </span>
          ))}
        </div>
        {rooms.length === 0 ? (
          <div className="sx-empty">
            Guruhlarda xona va vaqt ko‘rsatilmagan. Dars reja taxtasida guruhni tahrirlab «Xona», «Vaqt» va jadval turini kiriting — matritsa avtomatik to‘ladi.
          </div>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div className="sx-matrix" style={{ gridTemplateColumns: `110px repeat(${shown.length}, minmax(150px, 1fr))` }}>
              <div className="h">Vaqt sloti</div>
              {shown.map((r) => (
                <div key={r} className="h">
                  {info(r)?.title || r}
                  <div className="font-normal">
                    {r} · {m.cap(r)} o‘rin{info(r)?.note ? ` · ${info(r)?.note}` : ''}
                  </div>
                </div>
              ))}
              {times.map((t, ti) => {
                const pk = peakN > 0 && load(t) === peakN;
                return (
                  <div key={t} className="contents">
                    <div className={cn('sx-tslot', pk && 'pk')}>
                      <span>
                        {ti + 1}-slot{pk ? ' · pik' : ''}
                      </span>
                      <b>{t}</b>
                    </div>
                    {shown.map((r, ri) => {
                      const c = cellOf(r, t);
                      return (
                        <button
                          key={r}
                          className={cn('sx-slot', cls(c), c.kind === 'group' && c.clash > 1 && 'clash')}
                          style={{ animationDelay: `${Math.min(ti * shown.length + ri, 40) * 12}ms` }}
                          onClick={() => setOpen({ room: r, time: t })}
                        >
                          {c.kind === 'group' ? (
                            <>
                              <span className="t">
                                <span className="truncate">{c.g.course || '—'}</span>
                                <em>{c.g.enrolled == null ? '—' : `${c.g.enrolled}/${m.cap(r)}`}</em>
                              </span>
                              <b>
                                {c.g.name}
                                {c.clash > 1 ? ` +${c.clash - 1}` : ''}
                              </b>
                              <small>{c.g.teacher}</small>
                            </>
                          ) : c.kind === 'hold' ? (
                            <>
                              <span className="t">{c.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer'}</span>
                              <b>{c.h.title || '—'}</b>
                            </>
                          ) : (
                            'bo‘sh'
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <RoomRegister rooms={data.rooms} known={rooms} seats={data.plan.seats} />
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Jadvalga kiritilmagan guruhlar</h3>
          <small>{missing.length} ta</small>
        </div>
        {missing.length === 0 ? (
          <div className="sx-empty">Hamma guruhlar jadvalda ✓</div>
        ) : (
          <div className="flex max-h-[240px] flex-col gap-1.5 overflow-auto text-sm">
            {missing.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-2 rounded-lg bg-au-card-2 px-3 py-1.5">
                <span className="font-semibold">{g.name}</span>
                <span className="text-xs text-au-muted">
                  {[!g.room && 'xona', !g.time && 'vaqt', !g.schedule_type && 'kunlar'].filter(Boolean).join(', ')} yo‘q
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      {open && sel && (
        <SlotModal
          key={`${open.room}|${open.time}|${coh}`}
          cell={sel}
          room={open.room}
          roomInfo={info(open.room)}
          time={open.time}
          cohort={coh}
          peak={peakN > 0 && load(open.time) === peakN}
          cap={m.cap(open.room)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ funnel */
function Funnel({ leads, m, onPlan }: { leads: OpsData['leads']; m: OpsModel; onPlan: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const empty = { name: '', phone: '', source: 'instagram' as Source, course: '', stage: 'new' as Stage, note: '' };
  const [f, setF] = useState(empty);
  const [editId, setEditId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<Stage | 'all'>('all');
  const save = (input: Parameters<typeof saveLeadAction>[0], ok?: string, after?: () => void) =>
    start(async () => {
      const r = await saveLeadAction(input);
      if (r.error) toast.error(r.error === 'forbidden' ? "Ruxsat yo'q" : r.error === 'invalidInput' ? "Ma'lumot noto'g'ri" : r.error === 'notFound' ? 'Topilmadi — sahifani yangilang' : "Saqlab bo'lmadi");
      else {
        if (ok) toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  const count = (k: Stage) => leads.filter((l) => l.stage === k).length;
  // Funnel = leads that reached at least this stage (lost counted separately).
  const order: Stage[] = ['new', 'contacted', 'trial', 'enrolled'];
  const reached = (k: Stage) => leads.filter((l) => l.stage !== 'lost' && order.indexOf(l.stage) >= order.indexOf(k)).length;
  const total = leads.length;
  const enrolled = count('enrolled');
  const days = leads
    .filter((l) => l.enrolled_at)
    .map((l) => (Date.parse(l.enrolled_at!) - Date.parse(l.created_at)) / 864e5);
  const list = leads.filter((l) => filter === 'all' || l.stage === filter);
  return (
    <div className="sx-grid">
      <PlanFunnel key={`${m.sc}-${JSON.stringify(m.plan.scenarios[m.sc])}`} m={m} onPlan={onPlan} />
      <div className="sx-card sx-stat dark s3">
        <div className="l">Jami lidlar</div>
        <div className="v">{total}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Konversiya (lid → o‘quvchi)</div>
        <div className="v">{total ? pct(enrolled / total) : '—'}</div>
        <div className="d">{enrolled} ta yozildi</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">O‘rtacha yozilish muddati</div>
        <div className="v">{days.length ? `${(days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)} kun` : '—'}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Yo‘qotilgan</div>
        <div className="v" style={{ color: count('lost') ? 'var(--au-bad)' : undefined }}>{count('lost')}</div>
        <div className="d">{total ? pct(count('lost') / total) : ''}</div>
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Voronka</h3>
          <small>har bosqichga yetganlar</small>
        </div>
        <div className="sx-funnel">
          {order.map((k, i) => {
            const s = STAGES.find((x) => x.k === k)!;
            const v = reached(k);
            const prev = i ? reached(order[i - 1]) : v;
            return (
              <div key={k} className="st">
                <span className="font-semibold">{s.n}</span>
                <div className="tr">
                  <i style={{ width: `${reached('new') ? Math.max(6, (v / reached('new')) * 100) : 0}%`, background: s.c, animationDelay: `${i * 90}ms` }}>{v}</i>
                </div>
                <span className="text-right text-xs text-au-muted">{i && prev ? `${pct(v / prev)} o‘tdi` : ''}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Manbalar</h3>
          <small>lid va konversiya</small>
        </div>
        {total === 0 ? (
          <div className="sx-empty">Lidlar yo‘q</div>
        ) : (
          <HBars
            fmt={(v) => `${v}`}
            rows={SOURCES.map((s) => {
              const L = leads.filter((l) => l.source === s.k);
              const e = L.filter((l) => l.stage === 'enrolled').length;
              return { n: s.n, v: L.length, c: s.c, sub: L.length ? `${pct(e / L.length)} yozildi` : undefined };
            }).filter((r) => r.v > 0)}
          />
        )}
      </div>
      <div className="sx-card s12" ref={formRef}>
        <div className="sx-h">
          <h3>{editId ? 'Lidni tahrirlash' : 'Yangi lid'}</h3>
          {editId && <small>o‘zgartiring va «Saqlash»ni bosing</small>}
        </div>
        <div className="sx-form">
          <label className="min-w-[180px] flex-1">
            Ism
            <input className="sx-inp" maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </label>
          <label>
            Telefon
            <input className="sx-inp !w-[150px]" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </label>
          <label>
            Manba
            <select className="sx-inp !w-[140px]" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as Source })}>
              {SOURCES.map((s) => (
                <option key={s.k} value={s.k}>
                  {s.n}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kurs
            <input className="sx-inp !w-[150px]" maxLength={120} value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })} />
          </label>
          <label>
            Bosqich
            <select className="sx-inp !w-[160px]" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value as Stage })}>
              {STAGES.map((s) => (
                <option key={s.k} value={s.k}>
                  {s.n}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px] flex-1">
            Izoh
            <input className="sx-inp" maxLength={1000} value={f.note} placeholder="Masalan: kechqurun qo‘ng‘iroq qilish" onChange={(e) => setF({ ...f, note: e.target.value })} />
          </label>
          <button
            className="sx-btn primary"
            disabled={pending || !f.name.trim()}
            onClick={() =>
              save({ ...f, id: editId ?? undefined }, editId ? 'Lid saqlandi' : "Lid qo'shildi", () => {
                setF(empty);
                setEditId(null);
              })
            }
          >
            {editId ? 'Saqlash' : <><Plus className="size-4" /> Qo‘shish</>}
          </button>
          {editId && (
            <button className="sx-btn" onClick={() => { setEditId(null); setF(empty); }}>
              Bekor qilish
            </button>
          )}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Lidlar</h3>
          <span className="sp" />
          <div className="flex flex-wrap gap-1">
            <button className={cn('sx-chipb', filter === 'all' && 'on')} onClick={() => setFilter('all')}>
              Hammasi · {total}
            </button>
            {STAGES.map((s) => (
              <button key={s.k} className={cn('sx-chipb', filter === s.k && 'on')} onClick={() => setFilter(s.k)}>
                {s.n} · {count(s.k)}
              </button>
            ))}
          </div>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Ism</th>
                <th className="l">Telefon</th>
                <th className="l">Manba</th>
                <th className="l">Kurs</th>
                <th className="l">Sana</th>
                <th className="l">AI baho</th>
                <th className="l">Bosqich</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="l">
                    <div className="sx-empty">{filter === 'all' ? 'Hali lid yo‘q — yuqoridagi «Yangi lid» formasidan qo‘shing.' : 'Bu bosqichda lid yo‘q'}</div>
                  </td>
                </tr>
              )}
              {list.map((l, i) => (
                <tr key={l.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                  <td className="l">
                    <b>{l.name}</b>
                    {l.note && <div className="max-w-[260px] truncate text-xs text-au-muted" title={l.note}>{l.note}</div>}
                  </td>
                  <td className="l">{l.phone}</td>
                  <td className="l">{SOURCES.find((s) => s.k === l.source)?.n}</td>
                  <td className="l">{l.course}</td>
                  <td className="l">{tzDay(l.created_at).split('-').reverse().join('.')}</td>
                  <td className="l">
                    {l.ai_intent == null ? (
                      <span className="text-au-faint">—</span>
                    ) : (
                      <span className={cn('sx-pl', l.ai_intent >= 2 ? 'ok' : l.ai_intent >= 1 ? 'warn' : 'mute')} title="TypeSafe AI: yozilish ehtimoli">
                        {['Past', "O'rta", 'Yuqori', 'Juda yuqori'][Math.max(0, Math.min(3, Math.round(l.ai_intent)))]}
                        {(l.ai_hot ?? 0) >= 0.6 ? ' · bugun qo‘ng‘iroq' : ''}
                      </span>
                    )}
                  </td>
                  <td className="l">
                    <select
                      className="sx-inp !h-[30px] !w-[160px]"
                      value={l.stage}
                      disabled={pending}
                      style={{ color: STAGES.find((s) => s.k === l.stage)?.c, fontWeight: 700 }}
                      onChange={(e) =>
                        save(
                          { id: l.id, name: l.name, phone: l.phone, source: l.source, course: l.course, stage: e.target.value as Stage, note: l.note },
                          `«${l.name}» → ${STAGES.find((s) => s.k === e.target.value)?.n}`,
                        )
                      }
                    >
                      {STAGES.map((s) => (
                        <option key={s.k} value={s.k}>
                          {s.n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="inline-flex items-center gap-1">
                    <button
                      className="sx-btn sm"
                      aria-label="Tahrirlash"
                      onClick={() => {
                        setEditId(l.id);
                        setF({ name: l.name, phone: l.phone, source: l.source, course: l.course, stage: l.stage, note: l.note ?? '' });
                        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="sx-btn sm text-au-bad"
                      aria-label="O'chirish"
                      disabled={pending}
                      onClick={() =>
                        window.confirm(`«${l.name}» lidi o'chirilsinmi?`) &&
                        start(async () => {
                          const r = await deleteLeadAction(l.id);
                          if (r.error) toast.error("O'chirib bo'lmadi");
                          else {
                            toast.success("Lid o'chirildi");
                            router.refresh();
                          }
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ growth */
function Growth({ data, books, today, m, onPlan }: { data: OpsData; books: Books; today: string; m: OpsModel; onPlan: () => void }) {
  const leads = data.leads;
  const ym = today.slice(0, 7);
  const S = useMemo(() => monthlySeries(books.accounts, books.opening, books.entries, ym, 12), [books, ym]);
  const labels = S.map((m) => `${MONF[+m.ym.slice(5, 7) - 1].slice(0, 3)} ${m.ym.slice(2, 4)}`);
  const newLeads = S.map((m) => leads.filter((l) => tzDay(l.created_at).slice(0, 7) === m.ym).length);
  const enrolled = S.map((m) => leads.filter((l) => !!l.enrolled_at && tzDay(l.enrolled_at).slice(0, 7) === m.ym).length);
  const students = books.courses.reduce((a, c) => a + c.students, 0);
  const revNow = S[S.length - 1].revenue;
  const revPrev = S[S.length - 2]?.revenue ?? 0;
  const q = (k: number) => S.slice(k, k + 3).reduce((a, m) => a + m.revenue, 0);
  const lastQ = q(9);
  const prevQ = q(6);
  return (
    <div className="sx-grid">
      <Trajectory m={m} data={data} onPlan={onPlan} />
      <div className="sx-card sx-stat dark s3">
        <div className="l">Joriy o‘quvchilar</div>
        <div className="v">{students}</div>
        <div className="d">kurslar jadvalidan</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Oylik tushum o‘sishi</div>
        <div className="v" style={{ color: revNow >= revPrev ? 'var(--au-ok)' : 'var(--au-bad)' }}>
          {fmtGrowth(growthRate(revNow, revPrev))}
        </div>
        <div className="d">{fmtMln(revNow)} shu oy</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Chorak o‘sishi</div>
        <div className="v" style={{ color: lastQ < prevQ ? 'var(--au-bad)' : undefined }}>{fmtGrowth(growthRate(lastQ, prevQ))}</div>
        <div className="d">oxirgi 3 oy vs oldingi 3 oy</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">12 oyda yangi o‘quvchi</div>
        <div className="v">{enrolled.reduce((a, b) => a + b, 0)}</div>
        <div className="d">{newLeads.reduce((a, b) => a + b, 0)} liddan</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Tushum va sof foyda</h3>
          <small>jurnaldan · 12 oy</small>
        </div>
        <Chart
          labels={labels}
          fmt={fmtMln}
          series={[
            { n: 'Tushum', c: '#ff9f1c', v: S.map((m) => m.revenue) },
            { n: 'Sof foyda', c: '#139a52', v: S.map((m) => m.net), kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Lidlar va yozilganlar</h3>
          <small>oylik</small>
        </div>
        <Chart
          labels={labels}
          height={200}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Yangi lidlar', c: '#2477c9', v: newLeads },
            { n: 'Yozildi', c: '#139a52', v: enrolled },
          ]}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- KPI */
function Kpi({ data, today }: { data: OpsData; today: string }) {
  const [ym, setYm] = useState(today.slice(0, 7));
  const scoreFor = (staffId: string, m: string) =>
    computeKpiScore(
      data.metrics.filter((x) => x.staff_id === staffId),
      data.entries.filter((e) => e.month === m && data.metrics.some((x) => x.id === e.metric_id && x.staff_id === staffId)),
    );
  const people = data.staff
    .map((s) => ({ ...s, dept: ROLE_GROUP[s.role] ?? s.role, score: scoreFor(s.id, ym), prev: scoreFor(s.id, addMonths(ym, -1)) }))
    .filter((p) => p.score !== null || p.prev !== null);
  const depts = [...new Set(people.map((p) => p.dept))].map((d) => {
    const L = people.filter((p) => p.dept === d && p.score !== null);
    return { d, n: L.length, avg: L.length ? L.reduce((a, p) => a + (p.score ?? 0), 0) / L.length : null };
  });
  const scored = people.filter((p) => p.score !== null);
  const avg = scored.length ? scored.reduce((a, p) => a + p.score!, 0) / scored.length : null;
  const tone = (v: number | null) => (v === null ? 'mute' : v >= 100 ? 'ok' : v >= 80 ? 'warn' : 'bad');
  return (
    <div className="sx-grid">
      <div className="sx-card s12 !py-3">
        <div className="flex flex-wrap items-center gap-3">
          <MonthPicker value={ym} onChange={setYm} />
          <span className="text-sm text-au-muted">Moliya → KPI bo‘limida kiritilgan maqsad va natijalardan (vazn bilan, 150% cheklov)</span>
        </div>
      </div>
      <DeptKpi data={data} ym={ym} deptOf={(r) => ROLE_GROUP[r] ?? r} />
      <div className="sx-card sx-stat dark s4">
        <div className="l">Kompaniya o‘rtachasi</div>
        <div className="v">{avg === null ? '—' : `${avg.toFixed(1)}%`}</div>
        <div className="d">{scored.length} xodim baholangan</div>
      </div>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Bo‘limlar kesimida</h3>
        </div>
        {depts.length === 0 ? (
          <div className="sx-empty">Bu oy uchun KPI natijalari kiritilmagan</div>
        ) : (
          <HBars
            fmt={(v) => `${v.toFixed(1)}%`}
            rows={depts
              .filter((d) => d.avg !== null)
              .map((d, i) => ({ n: d.d, v: d.avg!, c: ['#ff9f1c', '#2477c9', '#e8567a', '#7a5af8', '#139a52', '#0ea5a4'][i % 6], sub: `${d.n} xodim` }))}
          />
        )}
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Xodimlar</h3>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Xodim</th>
                <th className="l">Bo‘lim</th>
                <th>O‘tgan oy</th>
                <th>Shu oy</th>
                <th>O‘zgarish</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} className="l">
                    <div className="sx-empty">Ma’lumot yo‘q</div>
                  </td>
                </tr>
              )}
              {[...people]
                .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
                .map((p, i) => (
                  <tr key={p.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                    <td className="l">
                      <b>{p.name}</b>
                    </td>
                    <td className="l">{p.dept}</td>
                    <td>{p.prev === null ? '—' : `${p.prev.toFixed(1)}%`}</td>
                    <td>
                      <span className={cn('sx-pl', tone(p.score))}>{p.score === null ? '—' : `${p.score.toFixed(1)}%`}</span>
                    </td>
                    <td>
                      {p.score !== null && p.prev !== null ? (
                        <span style={{ color: p.score >= p.prev ? 'var(--au-ok)' : 'var(--au-bad)' }}>
                          {p.score >= p.prev ? '▲' : '▼'} {Math.abs(p.score - p.prev).toFixed(1)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
