'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, ArrowRight, Clock3, Lightbulb, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { tashkentDayKey } from '@/lib/time';
import { setRoomFeaturesAction, setTeacherAvailabilityAction } from '@/lib/actions/operations';
import {
  courseBalance,
  fmtMin,
  freeSlots,
  isBlocking,
  isScheduled,
  scheduleIssues,
  toMin,
  type Cohort,
  type SchedGroup,
} from '@/lib/ops-schedule';
import { Chart, HBars } from './charts';
import { CountUp } from '@/components/motion/count-up';
import { playSound, toast } from './suite-shell';
import { courseColor, toSched } from './ops-schedule-timeline';
import type { OpsData } from './operations-workspace';

const COH: Record<Cohort, string> = { odd: 'Toq', even: 'Juft' };
const MON = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const tz = (s: string) => tashkentDayKey(new Date(s));
const OPEN = 8 * 60;
const CLOSE = 21 * 60;

/** Room-minutes used / available on a cohort, and the busiest half hour. */
function utilisation(groups: SchedGroup[], rooms: string[], cohort: Cohort) {
  const list = groups.filter((g) => isScheduled(g) && g.cohort === cohort);
  const used = list.reduce((a, g) => a + g.duration, 0);
  const avail = rooms.length * (CLOSE - OPEN);
  const slots: { t: number; n: number }[] = [];
  for (let t = OPEN; t < CLOSE; t += 30) slots.push({ t, n: new Set(list.filter((g) => toMin(g.time) <= t && t < toMin(g.time) + g.duration).map((g) => g.room)).size });
  const peak = slots.reduce((a, b) => (b.n > a.n ? b : a), { t: OPEN, n: 0 });
  return { pct: avail ? (used / avail) * 100 : 0, peak, slots };
}

function Kpi({ l, v, d, tone, i }: { l: string; v: string; d?: string; tone?: 'bad' | 'ok' | 'warn'; i: number }) {
  return (
    <div className="sx-card sx-stat ms-rise s2" style={{ ['--i' as string]: i }}>
      <div className="l">{l}</div>
      <div className="v" style={{ color: tone === 'bad' ? 'var(--au-bad)' : tone === 'ok' ? 'var(--au-ok)' : tone === 'warn' ? 'var(--au-accent-text)' : undefined }}>
        <CountUp value={v} />
      </div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}

/* ================================================================ overview */

export function OpsOverview({ data, capOf, rooms, onGo }: { data: OpsData; capOf: (r: string) => number; rooms: string[]; onGo: (tab: string, groupId?: string) => void }) {
  const groups = useMemo(() => toSched(data.groups), [data.groups]);
  const today = tashkentDayKey();
  const month = today.slice(0, 7);
  const odd = utilisation(groups, rooms, 'odd');
  const even = utilisation(groups, rooms, 'even');
  const sched = groups.filter(isScheduled);
  const seats = sched.reduce((a, g) => a + capOf(g.room), 0);
  const filled = sched.reduce((a, g) => a + (g.enrolled ?? 0), 0);
  const issues = scheduleIssues(groups, capOf, data.availability);
  const blocking = issues.filter(isBlocking);
  const unscheduled = groups.filter((g) => !isScheduled(g));
  const arrivals = data.leads.filter((l) => tz(l.created_at).startsWith(month)).length;
  const dayNum = Number(today.slice(8));
  const daysIn = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  const projected = dayNum ? Math.round((arrivals / dayNum) * daysIn) : 0;
  const prevMonth = (() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  })();
  const prevArrivals = data.leads.filter((l) => tz(l.created_at).startsWith(prevMonth)).length;

  // Recommendations: courses short of seats → a free evening slot to open a group.
  const since = Date.parse(`${today}T00:00:00Z`) - 90 * 864e5;
  const recent = data.leads.filter((l) => Date.parse(l.created_at) >= since);
  const balance = courseBalance(recent, 3, groups, capOf).filter((b) => b.gap > 0).slice(0, 3);
  const recs = balance.map((b) => {
    const cohort: Cohort = odd.pct <= even.pct ? 'odd' : 'even';
    const slots = freeSlots(groups, rooms, cohort, 90).filter((s) => toMin(s.time) >= 16 * 60 && capOf(s.room) >= 8);
    const best = slots.sort((a, z) => capOf(z.room) - capOf(a.room))[0];
    return { b, cohort, slot: best };
  });

  const attention = [
    ...blocking.map((i) => ({ tone: 'bad' as const, icon: AlertTriangle, text: i.text, group: i.groupId, tab: 'sched' })),
    ...issues.filter((i) => !isBlocking(i)).map((i) => ({ tone: 'warn' as const, icon: ShieldAlert, text: i.text, group: i.groupId, tab: 'sched' })),
    ...(unscheduled.length ? [{ tone: 'warn' as const, icon: Clock3, text: `${unscheduled.length} ta guruh jadvalga kiritilmagan`, group: undefined, tab: 'sched' }] : []),
  ];

  return (
    <div className="sx-grid">
      <Kpi i={0} l="Bandlik · toq" v={`${odd.pct.toFixed(0)}%`} d={`pik ${fmtMin(odd.peak.t)} · ${odd.peak.n}/${rooms.length} xona`} tone={odd.pct > 85 ? 'warn' : undefined} />
      <Kpi i={1} l="Bandlik · juft" v={`${even.pct.toFixed(0)}%`} d={`pik ${fmtMin(even.peak.t)} · ${even.peak.n}/${rooms.length} xona`} tone={even.pct > 85 ? 'warn' : undefined} />
      <Kpi i={2} l="O‘rinlar to‘lgan" v={seats ? `${Math.round((filled / seats) * 100)}%` : '—'} d={`${filled}/${seats} o‘rin`} />
      <Kpi i={3} l="To‘qnashuvlar" v={String(blocking.length)} d={blocking.length ? 'tuzatish kerak' : 'yo‘q ✓'} tone={blocking.length ? 'bad' : 'ok'} />
      <Kpi i={4} l="Jadvalsiz guruhlar" v={String(unscheduled.length)} d={`${groups.length} guruhdan`} tone={unscheduled.length ? 'warn' : 'ok'} />
      <Kpi
        i={5}
        l="Bu oy kelganlar"
        v={String(arrivals)}
        d={`bashorat ${projected} · o‘tgan oy ${prevArrivals}`}
        tone={projected >= prevArrivals ? 'ok' : 'warn'}
      />

      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Diqqat talab</h3>
          <small>{attention.length ? `${attention.length} ta` : 'hammasi joyida'}</small>
        </div>
        {attention.length === 0 ? (
          <div className="sx-empty">Jadvalda muammo yo‘q ✓</div>
        ) : (
          <ul className="flex max-h-[340px] flex-col gap-1.5 overflow-auto">
            {attention.map((a, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onGo(a.tab, a.group)}
                  className={cn('ms-rise group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors', a.tone === 'bad' ? 'border-au-bad/30 bg-au-bad-soft' : 'border-au-accent/30 bg-au-accent-soft/60')}
                  style={{ ['--i' as string]: Math.min(i, 8) }}
                >
                  <a.icon className={cn('size-4 shrink-0', a.tone === 'bad' ? 'text-au-bad' : 'text-au-accent-text')} />
                  <span className="min-w-0 flex-1 text-au-ink">{a.text}</span>
                  <ArrowRight className="size-4 text-au-muted transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Tavsiyalar</h3>
          <small>talab va bo‘sh o‘rinlar asosida · 90 kun</small>
        </div>
        {recs.length === 0 ? (
          <div className="sx-empty">Hozircha har bir kurs uchun o‘rin yetarli</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {recs.map(({ b, cohort, slot }, i) => (
              <li key={b.course} className="ms-rise rounded-lg bg-au-card-2 p-3 text-sm" style={{ ['--i' as string]: i }}>
                <div className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-au-accent-text" />
                  <div>
                    <b className="text-au-ink">{b.course}</b>
                    <span className="text-au-muted">
                      : oyiga ~{b.demand} kishi, bo‘sh o‘rin {b.freeSeats}.
                    </span>
                    {slot ? (
                      <div className="mt-1 text-au-ink">
                        Tavsiya: <b>{COH[cohort]} kunlar {slot.time}</b> da <b>{slot.room}</b> xonasida ({capOf(slot.room)} o‘rin) yangi guruh.
                      </div>
                    ) : (
                      <div className="mt-1 text-au-muted">Kechki bo‘sh slot yo‘q — xona yoki smena qo‘shishni ko‘rib chiqing.</div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Kun davomida yuklama</h3>
          <small>har yarim soatda band xonalar</small>
        </div>
        <Chart
          labels={odd.slots.map((s) => fmtMin(s.t))}
          series={[
            { n: 'Toq kunlar', c: 'var(--au-ink)', v: odd.slots.map((s) => s.n) },
            { n: 'Juft kunlar', c: 'var(--au-accent)', v: even.slots.map((s) => s.n), kind: 'line' },
          ]}
          refLine={{ v: rooms.length, t: `${rooms.length} xona` }}
          height={200}
          fmt={(v) => String(Math.round(v))}
        />
      </div>
    </div>
  );
}

/* ================================================================ capacity */

export function CapacityDemand({ data, capOf, rooms }: { data: OpsData; capOf: (r: string) => number; rooms: string[] }) {
  const groups = useMemo(() => toSched(data.groups), [data.groups]);
  const [coh, setCoh] = useState<Cohort>('odd');
  const today = tashkentDayKey();
  const since = Date.parse(`${today}T00:00:00Z`) - 90 * 864e5;
  const balance = courseBalance(
    data.leads.filter((l) => Date.parse(l.created_at) >= since),
    3,
    groups,
    capOf,
  );
  const halfHours: number[] = [];
  for (let t = OPEN; t < CLOSE; t += 30) halfHours.push(t);
  const busy = (room: string, t: number) =>
    groups.find((g) => isScheduled(g) && g.cohort === coh && g.room === room && toMin(g.time) <= t && t < toMin(g.time) + g.duration);

  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Bandlik xaritasi</h3>
          <small>xona × yarim soat</small>
          <span className="sp" />
          <div className="sx-seg">
            {(['odd', 'even'] as Cohort[]).map((c) => (
              <button key={c} className={cn(coh === c && 'on')} onClick={() => setCoh(c)}>
                {COH[c]} kunlar
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] gap-[3px]" style={{ gridTemplateColumns: `120px repeat(${halfHours.length}, 1fr)` }}>
            <span />
            {halfHours.map((t) => (
              <span key={t} className="text-center text-[9.5px] text-au-faint tabular-nums">
                {t % 60 === 0 ? fmtMin(t).slice(0, 2) : ''}
              </span>
            ))}
            {rooms.map((r, ri) => (
              <div key={r} className="contents">
                <span className="truncate pr-2 text-xs font-semibold text-au-ink">
                  {data.rooms.find((x) => x.code === r)?.title || r}
                </span>
                {halfHours.map((t, ti) => {
                  const g = busy(r, t);
                  return (
                    <span
                      key={t}
                      title={g ? `${g.name} · ${g.course} · ${g.time}` : `${r} ${fmtMin(t)} bo‘sh`}
                      className="ms-wave h-6 rounded-[4px]"
                      style={{ ['--i' as string]: ri + ti, background: g ? courseColor(g.course) : 'var(--au-card-2)', opacity: g ? 0.9 : 1 }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Talab va taklif</h3>
          <small>kurslar bo‘yicha · oyiga kelganlar vs bo‘sh o‘rinlar</small>
        </div>
        {balance.length === 0 ? (
          <div className="sx-empty">Kurs ma’lumoti yo‘q — kelganlarda kursni ko‘rsating</div>
        ) : (
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Kurs</th>
                <th>Talab / oy</th>
                <th>Guruhlar</th>
                <th>Bo‘sh o‘rin</th>
                <th>Farq</th>
              </tr>
            </thead>
            <tbody>
              {balance.map((b) => (
                <tr key={b.course}>
                  <td className="l">
                    <i className="mr-2 inline-block h-2.5 w-1 rounded-full align-middle" style={{ background: courseColor(b.course) }} />
                    <b>{b.course}</b>
                  </td>
                  <td>{b.demand}</td>
                  <td>{b.groups}</td>
                  <td>{b.freeSeats}</td>
                  <td>
                    <span className={cn('sx-pl', b.gap > 0 ? 'bad' : b.gap < -5 ? 'mute' : 'ok')}>{b.gap > 0 ? `−${b.gap} o‘rin yetmaydi` : b.gap < -5 ? `${-b.gap} bo‘sh` : 'muvozanat'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RoomFeatures data={data} rooms={rooms} capOf={capOf} groups={groups} />
    </div>
  );
}

const FEATURE_PRESETS = ['Proyektor', 'Smart doska', 'Kompyuterlar', 'Konditsioner', 'Audio', 'Bolalar uchun'];

function RoomFeatures({ data, rooms, capOf, groups }: { data: OpsData; rooms: string[]; capOf: (r: string) => number; groups: SchedGroup[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const known = data.rooms.map((r) => r.code);
  const toggle = (code: string, f: string) => {
    const cur = data.rooms.find((r) => r.code === code)?.features ?? [];
    const next = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
    start(async () => {
      const r = await setRoomFeaturesAction(code, next);
      if (r.error) return void toast.error(r.error === 'notFound' ? 'Avval xonani reyestrga qo‘shing' : "Saqlab bo'lmadi");
      playSound('tick');
      router.refresh();
    });
  };
  return (
    <div className="sx-card s5">
      <div className="sx-h">
        <h3>Xona profili</h3>
        <small>sig‘im, jihozlar, haftalik bandlik</small>
      </div>
      <div className="flex max-h-[360px] flex-col gap-2 overflow-auto">
        {rooms.map((r) => {
          const feats = data.rooms.find((x) => x.code === r)?.features ?? [];
          const mins = groups.filter((g) => isScheduled(g) && g.room === r).reduce((a, g) => a + g.duration * 3, 0);
          const pct = Math.round((mins / (2 * 3 * (CLOSE - OPEN))) * 100);
          return (
            <div key={r} className="rounded-lg bg-au-card-2 p-2.5">
              <div className="flex items-center justify-between gap-2 text-sm">
                <b className="text-au-ink">{data.rooms.find((x) => x.code === r)?.title || r}</b>
                <span className="text-xs text-au-muted">
                  {capOf(r) || '—'} o‘rin · {pct}% band
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {FEATURE_PRESETS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    disabled={busy || !data.canEdit || !known.includes(r)}
                    onClick={() => toggle(r, f)}
                    className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors', feats.includes(f) ? 'bg-au-ink text-au-card' : 'bg-au-card text-au-muted hover:text-au-ink')}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================ teachers */

export function TeachersOps({ data, cohort }: { data: OpsData; cohort: Cohort }) {
  const groups = useMemo(() => toSched(data.groups), [data.groups]);
  const teachers = [...new Map(groups.filter((g) => g.teacher_id).map((g) => [g.teacher_id!, g.teacher])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const LIMIT = 27; // hours per week
  const rows = teachers.map(([id, name]) => {
    const mine = groups.filter((g) => isScheduled(g) && g.teacher_id === id);
    const hours = mine.reduce((a, g) => a + (g.duration * 3) / 60, 0);
    // Idle gaps > 60 min and room changes between consecutive lessons, per cohort.
    let gaps = 0;
    let switches = 0;
    for (const c of ['odd', 'even'] as Cohort[]) {
      const day = mine.filter((g) => g.cohort === c).sort((a, b) => toMin(a.time) - toMin(b.time));
      for (let i = 1; i < day.length; i++) {
        const gap = toMin(day[i].time) - (toMin(day[i - 1].time) + day[i - 1].duration);
        if (gap > 60) gaps += 1;
        if (gap <= 15 && day[i].room !== day[i - 1].room) switches += 1;
      }
    }
    return { id, name, hours, gaps, switches, groups: mine.length };
  });
  const max = Math.max(LIMIT, ...rows.map((r) => r.hours));
  return (
    <div className="sx-grid">
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Haftalik yuklama</h3>
          <small>soat / hafta · chegara {LIMIT}</small>
        </div>
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-[150px_1fr_90px] items-center gap-2 text-sm">
              <span className="truncate font-medium text-au-ink">{r.name}</span>
              <span className="relative h-3 overflow-hidden rounded-full bg-au-card-2">
                <span className={cn('ms-fill absolute inset-y-0 left-0 rounded-full', r.hours > LIMIT ? 'bg-au-bad' : r.hours >= LIMIT - 4 ? 'bg-au-accent' : 'bg-au-ok')} style={{ width: `${(r.hours / max) * 100}%`, animationDelay: `${i * 35}ms` }} />
                <i className="absolute inset-y-0 w-0.5 bg-au-ink/50" style={{ left: `${(LIMIT / max) * 100}%` }} aria-hidden />
              </span>
              <span className="text-right text-xs text-au-muted tabular-nums">
                <b className={cn(r.hours > LIMIT ? 'text-au-bad' : 'text-au-ink')}>{r.hours.toFixed(1)} s</b> · {r.groups} gr.
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Jadval sifati</h3>
          <small>uzun bo‘shliqlar va xona almashish</small>
        </div>
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">O‘qituvchi</th>
              <th>Bo‘shliq &gt;1s</th>
              <th>Xona almashish</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="l">{r.name}</td>
                <td>
                  <span className={cn('sx-pl', r.gaps ? 'warn' : 'ok')}>{r.gaps}</span>
                </td>
                <td>
                  <span className={cn('sx-pl', r.switches ? 'warn' : 'ok')}>{r.switches}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AvailabilityEditor data={data} teachers={teachers} cohort={cohort} />
    </div>
  );
}

function AvailabilityEditor({ data, teachers, cohort }: { data: OpsData; teachers: [string, string][]; cohort: Cohort }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const mine = teachers.some(([id]) => id === data.meId);
  const [who, setWho] = useState<string>(mine ? data.meId : (teachers[0]?.[0] ?? ''));
  const [coh, setCoh] = useState<Cohort>(cohort);
  const current = data.availability.filter((a) => a.teacher_id === who && a.cohort === coh);
  const [wins, setWins] = useState<{ start: string; end: string }[] | null>(null);
  const list = wins ?? current.map((a) => ({ start: a.start, end: a.end }));
  const canEditWho = data.canEdit || who === data.meId;
  const save = () =>
    start(async () => {
      const r = await setTeacherAvailabilityAction(who, coh, list);
      if (r.error) return void toast.error(r.error === 'invalidInput' ? 'Vaqtlar noto‘g‘ri' : "Saqlab bo'lmadi");
      playSound('ok');
      toast.success('Mavjudlik saqlandi');
      setWins(null);
      router.refresh();
    });
  if (!teachers.length) return null;
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Mavjudlik</h3>
        <small>o‘qituvchi ishlay oladigan vaqtlar — jadvalga qo‘yishda tekshiriladi · bo‘sh = har doim</small>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="sx-inp !h-[32px] !w-[200px]" value={who} onChange={(e) => { setWho(e.target.value); setWins(null); }} aria-label="O‘qituvchi">
          {teachers.map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <div className="sx-seg">
          {(['odd', 'even'] as Cohort[]).map((c) => (
            <button key={c} className={cn(coh === c && 'on')} onClick={() => { setCoh(c); setWins(null); }}>
              {COH[c]}
            </button>
          ))}
        </div>
        {list.map((w, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-au-card-2 px-2 py-1">
            <input type="time" className="bg-transparent text-xs text-au-ink" value={w.start} disabled={!canEditWho} onChange={(e) => setWins(list.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />–
            <input type="time" className="bg-transparent text-xs text-au-ink" value={w.end} disabled={!canEditWho} onChange={(e) => setWins(list.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            {canEditWho && (
              <button type="button" aria-label="O‘chirish" onClick={() => setWins(list.filter((_, j) => j !== i))} className="text-au-faint hover:text-au-bad">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        {canEditWho && (
          <>
            <button className="sx-btn sm" onClick={() => setWins([...list, { start: '09:00', end: '18:00' }])}>
              <Plus className="size-3.5" /> Oraliq
            </button>
            <button className="sx-btn primary sm" disabled={busy || wins === null} onClick={save}>
              Saqlash
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ================================================================ intake */

export function IntakeAnalytics({ data }: { data: OpsData }) {
  const today = tashkentDayKey();
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = today.slice(0, 7).split('-').map(Number);
    return new Date(Date.UTC(y, m - 12 + i, 1)).toISOString().slice(0, 7);
  });
  const byMonth = (ym: string) => data.leads.filter((l) => tz(l.created_at).startsWith(ym));
  const arrivals = months.map((m) => byMonth(m).length);
  const enrolled = months.map((m) => byMonth(m).filter((l) => l.stage === 'enrolled').length);
  const cur = byMonth(months[11]);
  const conv = cur.length ? Math.round((cur.filter((l) => l.stage === 'enrolled').length / cur.length) * 100) : null;
  const srcRows = ['instagram', 'telegram', 'referral', 'walkin', 'website', 'other'].map((k) => {
    const L = data.leads.filter((l) => l.source === k && Date.parse(l.created_at) >= Date.parse(`${months[9]}-01T00:00:00Z`));
    const e = L.filter((l) => l.stage === 'enrolled').length;
    return { k, n: L.length, conv: L.length ? Math.round((e / L.length) * 100) : 0 };
  });
  const SRC_N: Record<string, [string, string]> = {
    instagram: ['Instagram', '#e8567a'],
    telegram: ['Telegram', '#2477c9'],
    referral: ['Tavsiya', '#139a52'],
    walkin: ['O‘zi keldi', '#ff9f1c'],
    website: ['Veb-sayt', '#7a5af8'],
    other: ['Boshqa', '#b9b2a6'],
  };
  const bestSrc = [...srcRows].filter((s) => s.n >= 3).sort((a, b) => b.conv - a.conv)[0];
  const courseRows = Object.entries(
    data.leads
      .filter((l) => l.course && Date.parse(l.created_at) >= Date.parse(`${months[9]}-01T00:00:00Z`))
      .reduce<Record<string, number>>((a, l) => ({ ...a, [l.course]: (a[l.course] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // Weekly cohorts: of each week's arrivals, how many reached trial / enrolled.
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = Date.parse(`${today}T00:00:00Z`) - i * 7 * 864e5;
    const start = end - 7 * 864e5;
    const L = data.leads.filter((l) => {
      const t = Date.parse(l.created_at);
      return t >= start && t < end + 864e5;
    });
    const trial = L.filter((l) => l.stage === 'trial' || l.stage === 'enrolled').length;
    const enr = L.filter((l) => l.stage === 'enrolled').length;
    return { label: new Date(start).toISOString().slice(5, 10).split('-').reverse().join('.'), n: L.length, trial, enr };
  });

  return (
    <div className="sx-grid">
      <Kpi i={0} l="Bu oy kelganlar" v={String(cur.length)} d={`o‘tgan oy ${arrivals[10]}`} tone={cur.length >= arrivals[10] ? 'ok' : undefined} />
      <Kpi i={1} l="12 oyda" v={String(arrivals.reduce((a, b) => a + b, 0))} d={`o‘rtacha ${Math.round(arrivals.reduce((a, b) => a + b, 0) / 12)} / oy`} />
      <Kpi i={2} l="Konversiya · bu oy" v={conv === null ? '—' : `${conv}%`} d="kelgan → yozildi" />
      <Kpi i={3} l="Eng samarali manba" v={bestSrc ? SRC_N[bestSrc.k][0] : '—'} d={bestSrc ? `${bestSrc.conv}% yoziladi · 3 oy` : 'ma’lumot kam'} />
      <Kpi i={4} l="Eng ko‘p so‘ralgan" v={courseRows[0]?.[0] ?? '—'} d={courseRows[0] ? `${courseRows[0][1]} kishi · 3 oy` : ''} />
      <Kpi i={5} l="Mavsum cho‘qqisi" v={arrivals.some(Boolean) ? MON[Number(months[arrivals.indexOf(Math.max(...arrivals))].slice(5, 7)) - 1] : '—'} d="oxirgi 12 oy" />

      <div className="sx-card s8">
        <div className="sx-h">
          <h3>12 oylik dinamika</h3>
          <small>kelganlar va yozilganlar</small>
        </div>
        <Chart
          labels={months.map((m) => MON[Number(m.slice(5, 7)) - 1])}
          series={[
            { n: 'Kelganlar', c: 'var(--au-chart-4)', v: arrivals },
            { n: 'Yozildi', c: 'var(--au-ok)', v: enrolled, kind: 'line' },
          ]}
          height={230}
          fmt={(v) => String(Math.round(v))}
        />
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Manbalar</h3>
          <small>3 oy · soni va konversiya</small>
        </div>
        <HBars
          fmt={(v) => `${v}`}
          rows={srcRows.filter((s) => s.n).map((s) => ({ n: SRC_N[s.k][0], v: s.n, c: SRC_N[s.k][1], sub: `${s.conv}% yozildi` }))}
        />
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Kurslar bo‘yicha talab</h3>
          <small>3 oy</small>
        </div>
        {courseRows.length === 0 ? (
          <div className="sx-empty">Kelganlarda kurs ko‘rsatilmagan</div>
        ) : (
          <HBars fmt={(v) => `${v}`} rows={courseRows.map(([c, n]) => ({ n: c, v: n, c: courseColor(c) }))} />
        )}
      </div>
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Haftalik kohortlar</h3>
          <small>har hafta kelganlarning qanchasi sinov va yozilishga yetdi</small>
        </div>
        <table className="sx-tbl">
          <thead>
            <tr>
              <th className="l">Hafta</th>
              <th>Kelgan</th>
              <th className="l">Sinov</th>
              <th className="l">Yozildi</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.label}>
                <td className="l">{w.label}</td>
                <td>
                  <b>{w.n}</b>
                </td>
                {[w.trial, w.enr].map((v, j) => (
                  <td key={j} className="l">
                    <span className="inline-flex w-full items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-au-card-2">
                        <span className="ms-fill block h-full rounded-full" style={{ width: `${w.n ? (v / w.n) * 100 : 0}%`, background: j ? 'var(--au-ok)' : 'var(--au-info)' }} />
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums">{w.n ? `${Math.round((v / w.n) * 100)}%` : '—'}</span>
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

