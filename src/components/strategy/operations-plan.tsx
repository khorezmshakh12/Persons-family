'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { ArrowDown, Settings2, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { formatUZS } from '@/lib/format-currency';
import { cn } from '@/lib/utils';
import { addMonths, fmtGrowth, fmtMln, growthRate } from '@/lib/accounting';
import type { Books } from '@/lib/accounting-data';
import { MONF } from '@/lib/strategy';
import { tashkentDayKey } from '@/lib/time';
import {
  SC_KEYS,
  SC_NAMES,
  lifetimeValue,
  logWidth,
  peakLoad,
  planMonths,
  planReady,
  planSummary,
  type OpsPlan,
  type PlanMonth,
  type PlanSummary,
  type ScKey,
  type Scenario,
} from '@/lib/ops-plan';
import { deleteRoomAction, deleteSlotHoldAction, savePlanAction, saveRoomAction, saveSlotHoldAction, setGroupEnrollmentAction } from '@/lib/actions/operations';
import { ask, playSound, toast } from './suite-shell';
import type { OpsData } from './operations-workspace';

const errMsg = (e: string) =>
  e === 'forbidden' ? "Ruxsat yo'q" : e === 'invalidInput' ? "Ma'lumot noto'g'ri" : e === 'notFound' ? 'Topilmadi — sahifani yangilang' : "Saqlab bo'lmadi";
const dmy = (k: string) => k.split('-').reverse().join('.');
const n0 = (v: number) => formatUZS(Math.round(v));
const tzDay = (s: string) => tashkentDayKey(new Date(s));
export const monLabel = (ym: string) => `${MONF[+ym.slice(5, 7) - 1]} ${ym.slice(2, 4)}`;

/** Run a Server Action with toast + refresh. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) {
        playSound('err');
        toast.error(errMsg(r.error));
      } else {
        toast.success(ok);
        after?.();
        router.refresh();
      }
    });
  return { pending, run };
}

/* ------------------------------------------------------------------ model */
export type Cohort = 'odd' | 'even';
export type OpsModel = {
  plan: OpsPlan;
  sc: ScKey;
  ready: boolean;
  today: string;
  baseline: number;
  baseSrc: string;
  months: PlanMonth[];
  sum: PlanSummary;
  rooms: string[];
  times: string[];
  cap: (room: string) => number;
  maxSeats: number;
  peak: { pct: number; time: string; cohort: Cohort };
  avgFee: number;
  leadsPerMonth: number;
  groupCount: number;
};

export function buildModel(data: OpsData, books: Books, today: string, sc: ScKey): OpsModel {
  const plan = data.plan;
  const ok = data.groups.filter((g) => g.room && g.time && g.schedule_type);
  const order = data.rooms.map((r) => r.code);
  const rooms = [...new Set([...order, ...ok.map((g) => g.room), ...data.holds.map((h) => h.room)])].sort(
    (a, b) => (order.includes(a) ? order.indexOf(a) : 1e3) - (order.includes(b) ? order.indexOf(b) : 1e3) || a.localeCompare(b),
  );
  const times = [...new Set([...ok.map((g) => g.time), ...data.holds.map((h) => h.time)])].sort();
  const cap = (room: string) => data.rooms.find((r) => r.code === room)?.capacity ?? plan.seats;
  const maxSeats = rooms.reduce((a, r) => a + cap(r), 0) * times.length * 2;
  const peaks = (['odd', 'even'] as Cohort[]).map((c) => ({ ...peakLoad(ok.filter((g) => g.schedule_type === c), rooms, times), cohort: c }));
  const peak = peaks[0].pct >= peaks[1].pct ? peaks[0] : peaks[1];
  const counted = data.groups.filter((g) => g.enrolled != null);
  const baseline = counted.length ? counted.reduce((a, g) => a + (g.enrolled ?? 0), 0) : books.courses.reduce((a, c) => a + c.students, 0);
  const baseSrc = counted.length ? `${counted.length} guruh sig'imidan` : 'kurslar jadvalidan';
  const months = planMonths(plan, plan.scenarios[sc], baseline, today);
  const sum = planSummary(months, baseline, plan.target);
  const st = books.courses.reduce((a, c) => a + c.students, 0);
  const avgFee = st ? books.courses.reduce((a, c) => a + c.fee * c.students, 0) / st : 0;
  const ym = today.slice(0, 7);
  const last3 = [1, 2, 3].map((k) => addMonths(ym, -k));
  const leadsPerMonth = data.leads.filter((l) => last3.includes(tzDay(l.created_at).slice(0, 7))).length / 3;
  return {
    plan,
    sc,
    ready: planReady(plan, today),
    today,
    baseline,
    baseSrc,
    months,
    sum,
    rooms,
    times,
    cap,
    maxSeats,
    peak,
    avgFee,
    leadsPerMonth,
    groupCount: counted.length || data.groups.length,
  };
}

/* ---------------------------------------------------------------- top bar */
export function OpsTop({ m, onSc, onPlan }: { m: OpsModel; onSc: (s: ScKey) => void; onPlan: () => void }) {
  const s = m.sum;
  const dash = !m.ready;
  const cards = [
    {
      l: `Yakuniy marra${m.plan.deadline ? ` · ${dmy(m.plan.deadline)}` : ''}`,
      v: dash ? '—' : n0(m.plan.target),
      d: dash ? 'reja sozlamalarida kiriting' : `talaba · ${fmtGrowth(growthRate(m.plan.target, m.baseline))}`,
    },
    {
      l: `Boshlang'ich baza · ${dmy(m.today)}`,
      v: n0(m.baseline),
      d: `${m.baseSrc} · ${m.maxSeats ? ((m.baseline / m.maxSeats) * 100).toFixed(1) : '—'}% quvvat`,
    },
    { l: "Kerakli sof o'sish", v: dash ? '—' : `${s.netGrowth >= 0 ? '+' : ''}${n0(s.netGrowth)}`, d: dash ? '' : `+${n0(s.churnTotal)} churn qoplash · ${n0(s.sales)} shartnoma` },
    { l: 'Kunlik lid kvotasi', v: dash ? '—' : s.dailyLeads.toFixed(1), d: dash ? '' : `lid/ish kuni · ${s.days} kun` },
    {
      l: 'Pik quvvat bandligi',
      v: m.times.length ? `${m.peak.pct.toFixed(1)}%` : '—',
      d: m.times.length ? `${(100 - m.peak.pct).toFixed(1)}% lean bufer · ${m.peak.time} ${m.peak.cohort === 'odd' ? 'toq' : 'juft'}` : 'xona/vaqt kiritilmagan',
      dk: true,
    },
  ];
  return (
    <div className="sx-card s12">
      <div className="sx-kpis5">
        {cards.map((c, i) => (
          <div key={c.l} className={cn('k', c.dk && 'dk')} style={{ animationDelay: `${i * 50}ms` }}>
            <small>{c.l}</small>
            <b>{c.v}</b>
            <span>{c.d}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-au-muted">Stsenariy</span>
        <div className="sx-seg">
          {SC_KEYS.map((k) => (
            <button key={k} className={cn(m.sc === k && 'on')} onClick={() => onSc(k)}>
              {SC_NAMES[k]}
            </button>
          ))}
        </div>
        <span className="sp flex-1" />
        <button className="sx-btn sm" onClick={onPlan}>
          <Settings2 className="size-4" /> Reja sozlamalari
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- modals */
function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    playSound('open');
    const kd = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', kd);
    return () => document.removeEventListener('keydown', kd);
  }, []);
  return (
    <div className="sx-modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sx-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h3 className="text-lg font-bold">{title}</h3>
            {sub && <p className="text-sm text-au-muted">{sub}</p>}
          </div>
          <button className="sx-btn sm" aria-label="Yopish" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const SC_FIELDS: { k: keyof Scenario; n: string; u: string; max: number; step: number }[] = [
  { k: 'churn', n: 'Oylik churn', u: '%', max: 100, step: 0.5 },
  { k: 'trial', n: 'Lid → sinov', u: '%', max: 100, step: 0.5 },
  { k: 'conv', n: "Lid → to'lov", u: '%', max: 100, step: 0.5 },
  { k: 'cpl', n: 'Lid narxi (CPL)', u: "so'm", max: 1e9, step: 1000 },
  { k: 'ctr', n: 'Reklama CTR', u: '%', max: 100, step: 0.01 },
];

export function PlanModal({ plan, leads, onClose }: { plan: OpsPlan; leads: OpsData['leads']; onClose: () => void }) {
  const [p, setP] = useState<OpsPlan>(plan);
  const { pending, run } = useAct();
  const setSc = (k: ScKey, f: keyof Scenario, v: number) => setP({ ...p, scenarios: { ...p.scenarios, [k]: { ...p.scenarios[k], [f]: v } } });
  // Real funnel rates from the lead register (lost/new included in the base).
  const total = leads.length;
  const trialPlus = leads.filter((l) => l.stage === 'trial' || l.stage === 'enrolled').length;
  const enrolled = leads.filter((l) => l.stage === 'enrolled').length;
  const fact = total ? { trial: +((trialPlus / total) * 100).toFixed(1), conv: +((enrolled / total) * 100).toFixed(1) } : null;
  return (
    <Modal title="Reja sozlamalari" sub="Marra, muddat va stsenariy ko'rsatkichlari — barcha hisoblar shu qiymatlardan" onClose={onClose}>
      <div className="sx-form mt-4">
        <label>
          Maqsad (talaba)
          <input className="sx-inp !w-[120px]" type="number" min={0} value={p.target === 0 ? '' : p.target} onChange={(e) => setP({ ...p, target: e.target.value === '' ? 0 : Math.max(0, Math.round(+e.target.value)) })} />
        </label>
        <label>
          Muddat
          <input className="sx-inp !w-[160px]" type="date" value={p.deadline} onChange={(e) => setP({ ...p, deadline: e.target.value })} />
        </label>
        <label>
          Guruh o&apos;rni (standart)
          <input className="sx-inp !w-[110px]" type="number" min={1} max={200} value={p.seats === 0 ? '' : p.seats} onChange={(e) => setP({ ...p, seats: e.target.value === '' ? 1 : Math.min(200, Math.max(1, Math.round(+e.target.value))) })} />
        </label>
        <label>
          Ish kunlari / hafta
          <input className="sx-inp !w-[100px]" type="number" min={1} max={7} value={p.workDays === 0 ? '' : p.workDays} onChange={(e) => setP({ ...p, workDays: e.target.value === '' ? 1 : Math.min(7, Math.max(1, Math.round(+e.target.value))) })} />
        </label>
      </div>
      <div className="sx-tw mt-3">
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Ko&apos;rsatkich</th>
              {SC_KEYS.map((k) => (
                <th key={k}>{SC_NAMES[k]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SC_FIELDS.map((f) => (
              <tr key={f.k}>
                <td className="l">
                  {f.n}, {f.u}
                </td>
                {SC_KEYS.map((k) => (
                  <td key={k}>
                    <input
                      className="sx-inp !h-[30px] !w-[110px]"
                      type="number"
                      min={0}
                      max={f.max}
                      step={f.step}
                      value={p.scenarios[k][f.k] === 0 ? '' : p.scenarios[k][f.k]}
                      onChange={(e) => setSc(k, f.k, e.target.value === '' ? 0 : Math.min(f.max, Math.max(0, +e.target.value || 0)))}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {fact && (
          <button
            className="sx-btn sm"
            title="Lidlar ro'yxatidagi haqiqiy konversiya"
            onClick={() => setP({ ...p, scenarios: { ...p.scenarios, average: { ...p.scenarios.average, trial: fact.trial, conv: fact.conv } } })}
          >
            Bazaviyga faktni olish ({fact.trial}% · {fact.conv}%)
          </button>
        )}
        <span className="flex-1" />
        <button className="sx-btn" onClick={onClose}>
          Bekor qilish
        </button>
        <button className="sx-btn primary" disabled={pending} onClick={() => run(() => savePlanAction(p), 'Reja saqlandi', onClose)}>
          Saqlash
        </button>
      </div>
    </Modal>
  );
}

export type Cell =
  | { kind: 'group'; g: OpsData['groups'][number]; clash: number }
  | { kind: 'hold'; h: OpsData['holds'][number] }
  | { kind: 'free' };
const SOP: Record<string, string> = {
  buffer: "LEAN OPERATSION BUFER: slot dars qoldirganlar bilan ishlash (makeup), Speaking Club va metodik birlashma uchun zaxira.",
  trial: "SINOV DARSI: yangi nomzodlar uchun bepul dars va shartnoma yopish. Sotuv bo'limi jalb qilinadi.",
  group: "Dars oralig'ida 10 daqiqalik shamollatish. Davomat CRM ga qayd etiladi.",
  free: "Bo'sh katak: sinov darsi yoki lean bufer sifatida band qiling yoki guruhga xona/vaqt bering.",
};
export function SlotModal({
  cell,
  room,
  roomInfo,
  time,
  cohort,
  peak,
  cap,
  onClose,
}: {
  cell: Cell;
  room: string;
  roomInfo?: OpsData['rooms'][number];
  time: string;
  cohort: Cohort;
  peak: boolean;
  cap: number;
  onClose: () => void;
}) {
  const { pending, run } = useAct();
  const [enr, setEnr] = useState(cell.kind === 'group' ? cell.g.enrolled ?? 0 : 0);
  const [kind, setKind] = useState<'trial' | 'buffer'>(cell.kind === 'hold' ? cell.h.kind : 'trial');
  const [title, setTitle] = useState(cell.kind === 'hold' ? cell.h.title : '');
  const coh = cohort === 'odd' ? 'Toq kunlar · Du-Chor-Ju' : 'Juft kunlar · Se-Pay-Sha';
  const head = cell.kind === 'group' ? cell.g.name : cell.kind === 'hold' ? (cell.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer') : "Bo'sh slot";
  const fields: [string, React.ReactNode][] = [
    ['Auditoriya', `${roomInfo?.title || room} (${room})${roomInfo?.note ? ` · ${roomInfo.note}` : ''}`],
    ['Vaqt', `${time} · ${coh}${peak ? ' (pik)' : ''}`],
  ];
  if (cell.kind === 'group') {
    fields.push(['Guruh', `${cell.g.name}${cell.g.course ? ` · ${cell.g.course}` : ''}`]);
    fields.push(["Sig'im", `${cell.g.enrolled ?? '—'}/${cap} (max ${cap})`]);
    fields.push(["Mas'ul", cell.g.teacher || '—']);
    fields.push(["Bo'sh joy", cell.g.enrolled == null ? '—' : String(Math.max(0, cap - cell.g.enrolled))]);
    if (cell.clash > 1) fields.push(['Ogohlantirish', <span key="c" className="text-au-bad">{cell.clash} guruh bir vaqtda</span>]);
  } else if (cell.kind === 'hold') {
    fields.push(['Tur', cell.h.kind === 'trial' ? 'Sinov darsi' : 'Lean bufer']);
    fields.push(['Izoh', cell.h.title || '—']);
  }
  return (
    <Modal title={head} sub={`${roomInfo?.title || room} · ${time}`} onClose={onClose}>
      <div className="sx-mg2">
        {fields.map(([k, v]) => (
          <div key={k}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="sx-sop">
        <small>Operatsion yo&apos;riqnoma (SOP)</small>
        <p>{SOP[cell.kind === 'hold' ? cell.h.kind : cell.kind]}</p>
      </div>
      <div className="sx-form mt-4">
        {cell.kind === 'group' && (
          <>
            <label>
              O&apos;quvchilar soni
              <input className="sx-inp !w-[110px]" type="number" min={0} max={500} value={enr} onChange={(e) => setEnr(Math.max(0, Math.round(+e.target.value)))} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => setGroupEnrollmentAction(cell.g.id, enr), "Sig'im saqlandi", onClose)}>
              Saqlash
            </button>
          </>
        )}
        {cell.kind === 'hold' && (
          <>
            {/* Editable booking (owner, 2026-10-06): change its type / note. */}
            <label>
              Tur
              <select className="sx-inp !w-[150px]" value={kind} onChange={(e) => setKind(e.target.value as 'trial' | 'buffer')}>
                <option value="trial">Sinov darsi</option>
                <option value="buffer">Lean bufer</option>
              </select>
            </label>
            <label className="min-w-[180px] flex-1">
              Izoh
              <input className="sx-inp" maxLength={120} value={title} placeholder="Masalan: Speaking Club" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveSlotHoldAction({ id: cell.h.id, room, time, cohort, kind, title }), 'Saqlandi', onClose)}>
              Saqlash
            </button>
            <button className="sx-btn text-au-bad" disabled={pending} onClick={() => run(() => deleteSlotHoldAction(cell.h.id), "Band qilish bekor qilindi", onClose)}>
              O&apos;chirish
            </button>
          </>
        )}
        {cell.kind === 'free' && (
          <>
            <label>
              Tur
              <select className="sx-inp !w-[150px]" value={kind} onChange={(e) => setKind(e.target.value as 'trial' | 'buffer')}>
                <option value="trial">Sinov darsi</option>
                <option value="buffer">Lean bufer</option>
              </select>
            </label>
            <label className="min-w-[180px] flex-1">
              Izoh
              <input className="sx-inp" maxLength={120} value={title} placeholder="Masalan: Speaking Club" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <button className="sx-btn primary" disabled={pending} onClick={() => run(() => saveSlotHoldAction({ room, time, cohort, kind, title }), 'Slot band qilindi', onClose)}>
              Band qilish
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ room register */
export function RoomRegister({ rooms, known, seats }: { rooms: OpsData['rooms']; known: string[]; seats: number }) {
  const { pending, run } = useAct();
  const rows = [...rooms, ...known.filter((c) => !rooms.some((r) => r.code === c)).map((c) => ({ code: c, title: '', capacity: seats, note: '' }))];
  const [edit, setEdit] = useState<Record<string, OpsData['rooms'][number]>>({});
  const [nw, setNw] = useState({ code: '', title: '', capacity: seats, note: '' });
  const val = (r: OpsData['rooms'][number]) => edit[r.code] ?? r;
  const set = (r: OpsData['rooms'][number], patch: Partial<OpsData['rooms'][number]>) => setEdit({ ...edit, [r.code]: { ...val(r), ...patch } });
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Xonalar reyestri</h3>
        <small>nomi, sig&apos;imi va yo&apos;nalishi — matritsa va nazariy maksimum shundan hisoblanadi</small>
      </div>
      <div className="sx-tw">
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Kod (guruhdagi «Xona»)</th>
              <th className="l">Nomi</th>
              <th>Sig&apos;im</th>
              <th className="l">Izoh (m², yo&apos;nalish)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = val(r);
              const saved = rooms.some((x) => x.code === r.code);
              return (
                <tr key={r.code}>
                  <td className="l">
                    <b>{r.code}</b>
                    {!saved && <div className="text-xs text-au-muted">reyestrda yo&apos;q</div>}
                  </td>
                  <td className="l">
                    <input className="sx-inp !h-[30px]" maxLength={80} value={v.title} onChange={(e) => set(r, { title: e.target.value })} />
                  </td>
                  <td>
                    <input className="sx-inp !h-[30px] !w-[80px]" type="number" min={1} max={200} value={v.capacity} onChange={(e) => set(r, { capacity: Math.min(200, Math.max(1, Math.round(+e.target.value))) })} />
                  </td>
                  <td className="l">
                    <input className="sx-inp !h-[30px]" maxLength={200} value={v.note} onChange={(e) => set(r, { note: e.target.value })} />
                  </td>
                  <td>
                    <span className="inline-flex gap-1">
                      <button className="sx-btn sm primary" disabled={pending} onClick={() => run(() => saveRoomAction(v), 'Xona saqlandi')}>
                        Saqlash
                      </button>
                      {saved && (
                        <button
                          className="sx-btn sm text-au-bad"
                          disabled={pending}
                          onClick={async () => (await ask(`«${r.code}» reyestrdan o'chirilsinmi?`)) && run(() => deleteRoomAction(r.code), "Xona o'chirildi")}
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={60} placeholder="Yangi kod" value={nw.code} onChange={(e) => setNw({ ...nw, code: e.target.value })} />
              </td>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={80} value={nw.title} onChange={(e) => setNw({ ...nw, title: e.target.value })} />
              </td>
              <td>
                <input className="sx-inp !h-[30px] !w-[80px]" type="number" min={1} max={200} value={nw.capacity} onChange={(e) => setNw({ ...nw, capacity: Math.min(200, Math.max(1, Math.round(+e.target.value))) })} />
              </td>
              <td className="l">
                <input className="sx-inp !h-[30px]" maxLength={200} value={nw.note} onChange={(e) => setNw({ ...nw, note: e.target.value })} />
              </td>
              <td>
                <button
                  className="sx-btn sm primary"
                  disabled={pending || !nw.code.trim()}
                  onClick={() => run(() => saveRoomAction(nw), "Xona qo'shildi", () => setNw({ code: '', title: '', capacity: seats, note: '' }))}
                >
                  Qo&apos;shish
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- reverse funnel */
function NeedPlan({ onPlan }: { onPlan: () => void }) {
  return (
    <div className="sx-card s12">
      <div className="sx-empty">
        Reja hali sozlanmagan: marra (talaba soni), muddat va stsenariy ko&apos;rsatkichlarini kiriting — teskari voronka, byudjet va traektoriya avtomatik hisoblanadi.
        <div className="mt-3">
          <button className="sx-btn primary" onClick={onPlan}>
            <Settings2 className="size-4" /> Reja sozlamalari
          </button>
        </div>
      </div>
    </div>
  );
}

const pctS = (v: number, d = 1) => `${v.toFixed(d)}%`;
export function PlanFunnel({ m, onPlan }: { m: OpsModel; onPlan: () => void }) {
  const base = m.plan.scenarios[m.sc];
  const [sim, setSim] = useState({ churn: base.churn, conv: base.conv, cpl: base.cpl });
  if (!m.ready) return <NeedPlan onPlan={onPlan} />;
  const s = m.sum;
  const t2p = base.trial > 0 ? (base.conv / base.trial) * 100 : 0;
  const st: [string, string, number, string, string, string][] = [
    ['Marketing qamrovi', "Reklama ko'rishlar (reach)", s.reach, base.ctr > 0 ? `CTR ${pctS(base.ctr, 2)}` : 'CTR kiritilmagan', base.ctr > 0 ? `${n0(Math.max(0, s.reach - s.leads))} lidga aylanmadi` : 'Reja sozlamalarida CTR ni kiriting', 'var(--au-card-2)'],
    ['Saralangan lidlar', 'Telefon va maqsadi aniq arizalar', s.leads, `Lid → sinov ${pctS(base.trial)}`, `${n0(Math.max(0, s.leads - s.trials))} sinovga kelmadi`, 'var(--au-chart-4)'],
    ['Sinov darsiga kelganlar', "Filialga kelib darsda o'tirganlar", s.trials, `Sinov → to'lov ${pctS(t2p)}`, `Kelmadi ${pctS(100 - base.trial)}`, 'var(--au-accent-soft)'],
    ['Yangi shartnomalar', "Birinchi oylik to'lovni qilganlar", s.sales, `Churn ${pctS(base.churn)}/oy`, `Rad etdi ${pctS(Math.max(0, 100 - t2p))}`, 'var(--au-accent)'],
    ['Faol talabalar', `${dmy(m.plan.deadline)} holatiga`, m.plan.target, `Baza ${n0(m.baseline)} + ${n0(s.netGrowth)}`, `−${n0(s.churnTotal)} churn`, 'var(--au-primary)'],
  ];
  const mx = Math.max(...st.map((x) => x[2]));
  const mn = Math.max(1, Math.min(...st.map((x) => x[2]).filter((v) => v > 0)));
  const ltv = lifetimeValue(m.avgFee, base.churn);
  const ratio = ltv !== null && s.cac > 0 ? ltv / s.cac : null;
  const ue: [string, string, string, boolean?][] = [
    ['Lid tannarxi (CPL)', `${fmtMln(base.cpl)} so'm`, 'har bir lid uchun'],
    ['Mijoz narxi (CAC)', s.cac ? `${fmtMln(s.cac)} so'm` : '—', 'byudjet / yangi shartnoma'],
    ['Marketing byudjeti', `${fmtMln(s.budget)} so'm`, `${dmy(m.today)} – ${dmy(m.plan.deadline)}`],
    [
      'LTV / CAC',
      ltv === null ? '—' : `${fmtMln(ltv)} · ${ratio === null ? '—' : ratio.toFixed(1)}`,
      ratio === null ? (m.avgFee ? 'churn kiritilmagan' : "kurs to'lovlari kiritilmagan") : ratio >= 3 ? "> 3.0 — sog'lom" : '< 3.0 — xavfli',
      true,
    ],
    ['Kunlik kvota', `${s.dailyLeads.toFixed(1)} lid`, `${s.dailySales.toFixed(1)} yangi to'lov/kun`],
  ];
  // Simulator: same plan, the selected scenario with churn / conv / CPL overridden.
  const simSum = planSummary(planMonths(m.plan, { ...base, ...sim }, m.baseline, m.today), m.baseline, m.plan.target);
  const out: [string, string, number, (v: number) => string][] = [
    ['Kerakli yangi sotuv', n0(simSum.sales), simSum.sales - s.sales, n0],
    ['Kerakli lidlar', n0(simSum.leads), simSum.leads - s.leads, n0],
    ['Kerakli byudjet', `${fmtMln(simSum.budget)} so'm`, simSum.budget - s.budget, fmtMln],
    ['Kutilayotgan CAC', simSum.cac ? `${fmtMln(simSum.cac)} so'm` : '—', simSum.cac - s.cac, fmtMln],
    ['Kunlik lid oqimi', simSum.dailyLeads.toFixed(1), simSum.dailyLeads - s.dailyLeads, (v) => v.toFixed(1)],
  ];
  const sliders: [keyof typeof sim, string, number, number, number, string, (v: number) => string][] = [
    ['churn', 'Oylik churn', 0, 30, 0.5, 'Oyiga ketayotgan talabalar ulushi', (v) => `${v.toFixed(1)}%`],
    ['conv', "Lid → to'lov konversiyasi", 1, 80, 0.5, 'Sotuv bo‘limi samaradorligi', (v) => `${v.toFixed(1)}%`],
    ['cpl', 'Lid tannarxi (CPL)', 0, Math.max(100000, base.cpl * 3), 1000, 'Target reklama narxi', (v) => `${fmtMln(v)} so'm`],
  ];
  return (
    <>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Teskari voronka</h3>
          <small>
            {n0(m.plan.target)} marradan qamrovgacha · {SC_NAMES[m.sc]}
          </small>
        </div>
        <div className="sx-rfun">
          {st.map((x, i) => (
            <div key={x[0]}>
              <div className="r">
                <div>
                  <small>{i + 1}-bosqich</small>
                  <b>{x[0]}</b>
                  <span>{x[1]}</span>
                </div>
                <div className="bar">
                  <i style={{ width: `${logWidth(x[2], mx, mn)}%`, background: x[5], color: i > 2 ? 'var(--au-primary-ink)' : 'var(--au-ink)', animationDelay: `${i * 80}ms` }}>
                    {n0(x[2])}
                  </i>
                </div>
                <div>
                  <b>{x[3]}</b>
                  <span>{x[4]}</span>
                </div>
              </div>
              {i < 4 && <ArrowDown className="mx-auto size-3.5 text-au-faint" />}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-au-muted">Ustun uzunligi logarifmik shkalada — qamrov va talabalar soni orasidagi katta farqni bitta ko&apos;rinishda ko&apos;rsatish uchun.</p>
      </div>
      <div className="s4 flex flex-col gap-3">
        {ue.map((e, i) => (
          <div key={e[0]} className={cn('sx-card sx-stat', i === 3 && 'dark')}>
            <div className="l">{e[0]}</div>
            <div className="v !text-xl">{e[1]}</div>
            <div className="d">{e[2]}</div>
          </div>
        ))}
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Interaktiv voronka simulyatori</h3>
          <small>o&apos;z ko&apos;rsatkichlaringizni sinab ko&apos;ring · {SC_NAMES[m.sc]} stsenariyga nisbatan</small>
        </div>
        <div className="sx-sim">
          {sliders.map(([k, n, lo, hi, step, hint, f]) => (
            <label key={k} className="text-sm">
              <span className="flex justify-between">
                <span>{n}</span>
                <b>{f(sim[k])}</b>
              </span>
              <input className="sx-range" type="range" min={lo} max={hi} step={step} value={sim[k]} onChange={(e) => setSim({ ...sim, [k]: +e.target.value })} />
              <span className="text-xs text-au-muted">{hint}</span>
            </label>
          ))}
          <button className="sx-btn sm" onClick={() => setSim({ churn: base.churn, conv: base.conv, cpl: base.cpl })}>
            Standartni tiklash
          </button>
        </div>
        <div className="sx-rib">
          {out.map(([n, v, d, f]) => (
            <div key={n}>
              <b>{v}</b>
              <small>{n}</small>
              <em style={{ color: d <= 0 ? 'var(--au-ok)' : 'var(--au-bad)' }}>
                {d > 0 ? '+' : d < 0 ? '−' : '±'}
                {f(Math.abs(d))}
              </em>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
