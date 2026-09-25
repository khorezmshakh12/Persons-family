'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BarChart3, Briefcase, CalendarRange, CheckCheck, ListTodo, ShieldCheck, Zap } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  MONF,
  PRIORITIES,
  STATUSES,
  WORKSTREAMS,
  addDays,
  dayNum,
  daysBetween,
  fmtDay,
  isLate,
  type StrategyPerson,
  type StrategyTask,
  type TaskStatus,
} from '@/lib/strategy';
import { saveStrategyTaskAction } from '@/lib/actions/strategy';
import { tashkentDayKey } from '@/lib/time';
import { SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { Chart, HBars } from './charts';
import { PersonAvatar, PriorityChip, StatusChip } from './bits';
import './strategy.css';
import './suite.css';

type STask = StrategyTask & { created_at: string; done_at: string | null };
export type PfData = {
  spaces: { id: string; name: string; color: string; start_date: string; end_date: string }[];
  stasks: STask[];
  tasks: { id: string; title: string; status: string; assigned_to: string | null; created_at: string; deadline: string | null; submitted_at: string | null; completed_at: string | null }[];
  issues: { id: string; title: string; status: string; assigned_to: string | null; created_at: string; resolved_at: string | null }[];
  people: StrategyPerson[];
  milestones: { id: string; space_id: string; title: string; date: string }[];
};

type Tab = 'port' | 'back' | 'sprint' | 'sched' | 'alm' | 'review' | 'rep';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'port', n: 'Portfel', Icon: Briefcase },
  { v: 'back', n: 'Backlog', Icon: ListTodo },
  { v: 'sprint', n: 'Sprint', Icon: Zap },
  { v: 'sched', n: 'Reja (Gantt)', Icon: CalendarRange },
  { v: 'alm', n: 'ALM · Sifat', Icon: ShieldCheck },
  { v: 'review', n: 'Tasdiqlash', Icon: CheckCheck },
  { v: 'rep', n: 'Hisobotlar', Icon: BarChart3 },
];
const KEY = 'persons-pf-tab';
const WIP = { progress: 4, review: 3 } as const;
/** Sprint 1 starts Monday 5 Jan 2026; sprints are 14 days. */
const SPRINT_ANCHOR = '2026-01-05';
/** Tashkent calendar day of a timestamptz string. The raw wire value is in
 * the DB session's zone (UTC), so `.slice(0, 10)` put anything stamped
 * 00:00–05:00 Tashkent on the previous day (wrong week/sprint bucket, and
 * compared against the Tashkent `today`). */
const d10 = (s: string | null) => (s ? tashkentDayKey(new Date(s)) : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;

function sprintOf(today: string) {
  const n = Math.floor(daysBetween(SPRINT_ANCHOR, today) / 14);
  const from = addDays(SPRINT_ANCHOR, n * 14);
  return { no: n + 1, from, to: addDays(from, 13) };
}
/** Monday-start weeks, `n` of them ending with the week containing `today`. */
function weeks(today: string, n: number) {
  const dow = (new Date(dayNum(today) * 864e5).getUTCDay() + 6) % 7;
  const last = addDays(today, -dow);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(last, (i - n + 1) * 7);
    return { from, to: addDays(from, 6) };
  });
}

export function PerforceWorkspace({ data, today }: { data: PfData; today: string }) {
  const [tab, setTab] = useState<Tab>('port');
  const [stasks, setStasks] = useState(data.stasks);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      if (v && TABS.some((t) => t.v === v)) setTab(v);
    } catch {}
  }, []);
  const go = (v: string) => {
    setTab(v as Tab);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const router = useRouter();
  const [, start] = useTransition();
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const spaceById = useMemo(() => new Map(data.spaces.map((s) => [s.id, s])), [data.spaces]);

  const patch = (id: string, p: Partial<STask>, msg?: string) => {
    const prev = stasks.find((t) => t.id === id);
    if (!prev) return;
    const next = { ...prev, ...p };
    if (p.status === 'done') next.progress = 100;
    setStasks((l) => l.map((t) => (t.id === id ? next : t)));
    start(async () => {
      const r = await saveStrategyTaskAction({
        id,
        spaceId: next.space_id,
        title: next.title,
        description: next.description,
        workstream: next.workstream,
        assigneeId: next.assignee_id,
        startDate: next.start_date,
        endDate: next.end_date,
        status: next.status,
        priority: next.priority,
        progress: next.progress,
      });
      if (r.error !== undefined) {
        setStasks((l) => l.map((t) => (t.id === id ? prev : t)));
        toast.error("Saqlab bo'lmadi");
      } else {
        setStasks((l) => l.map((t) => (t.id === id ? { ...t, ...r.task, done_at: r.task.status === 'done' ? t.done_at ?? new Date().toISOString() : null } : t)));
        if (msg) toast.success(msg);
        router.refresh();
      }
    });
  };

  const items: PaletteItem[] = [
    ...data.spaces.map((s) => ({ g: 'Portfel', t: s.name, run: () => go('port') })),
    ...stasks.map((t) => ({ g: 'Vazifalar', t: t.title, sub: STATUSES[t.status].n, run: () => go('back') })),
  ];
  const sp = sprintOf(today);

  return (
    <SuiteShell section="pf" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead crumb="Persons Perforce · Plan · ALM · Review" title="Persons" em="Perforce" pill={`Sprint ${sp.no} · ${fmtDay(sp.from)} – ${fmtDay(sp.to)}`} />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'port' && <Portfolio data={data} stasks={stasks} today={today} />}
          {tab === 'back' && <Backlog stasks={stasks} spaceById={spaceById} personById={personById} today={today} patch={patch} />}
          {tab === 'sprint' && <Sprint stasks={stasks} personById={personById} today={today} patch={patch} />}
          {tab === 'sched' && <Schedule data={data} stasks={stasks} today={today} />}
          {tab === 'alm' && <Alm data={data} personById={personById} today={today} />}
          {tab === 'review' && <Review data={data} personById={personById} today={today} />}
          {tab === 'rep' && <Reports data={data} stasks={stasks} personById={personById} today={today} />}
        </div>
      </section>
    </SuiteShell>
  );
}

/* ---------------------------------------------------------------- portfolio */
function health(tasks: STask[], s: PfData['spaces'][number], today: string) {
  const n = tasks.length;
  const late = tasks.filter((t) => isLate(t, today)).length;
  const progress = n ? tasks.reduce((a, t) => a + t.progress, 0) / n : 0;
  const span = Math.max(1, daysBetween(s.start_date, s.end_date));
  const elapsed = Math.min(100, Math.max(0, (daysBetween(s.start_date, today) / span) * 100));
  const behind = elapsed - progress;
  const h = late / Math.max(1, n) > 0.2 || behind > 25 ? 'off' : late > 0 || behind > 10 ? 'risk' : 'on';
  return { n, late, progress, elapsed, behind, h: h as 'on' | 'risk' | 'off' };
}
const HL = { on: ['Rejada', 'ok'], risk: ['Xavf ostida', 'warn'], off: ['Rejadan ortda', 'bad'] } as const;

function Portfolio({ data, stasks, today }: { data: PfData; stasks: STask[]; today: string }) {
  const rows = data.spaces.map((s) => ({ s, ...health(stasks.filter((t) => t.space_id === s.id), s, today) }));
  const all = stasks.length;
  const done = stasks.filter((t) => t.status === 'done').length;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Loyihalar</div>
        <div className="v">{data.spaces.length}</div>
        <div className="d">{rows.filter((r) => r.h === 'on').length} tasi rejada</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Vazifalar bajarilishi</div>
        <div className="v">{all ? pct(done / all) : '—'}</div>
        <div className="d">
          {done} / {all}
        </div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Kechikkan</div>
        <div className="v" style={{ color: rows.some((r) => r.late) ? 'var(--au-bad)' : 'var(--au-ok)' }}>{rows.reduce((a, r) => a + r.late, 0)}</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Xavf ostidagi loyihalar</div>
        <div className="v">{rows.filter((r) => r.h !== 'on').length}</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Portfel salomatligi</h3>
          <small>progress vs o‘tgan vaqt · kechikkan vazifalar ulushi</small>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">Strategiyada maydon yo‘q</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Loyiha</th>
                  <th className="l">Muddat</th>
                  <th>Vazifa</th>
                  <th className="l">Progress / vaqt</th>
                  <th>Kechikkan</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.s.id} style={{ animationDelay: `${i * 40}ms` }}>
                    <td className="l">
                      <span className="mr-2 inline-block size-2.5 rounded" style={{ background: r.s.color }} />
                      <b>{r.s.name}</b>
                    </td>
                    <td className="l">
                      {fmtDay(r.s.start_date)} – {fmtDay(r.s.end_date)}
                    </td>
                    <td>{r.n}</td>
                    <td className="l">
                      <div className="flex min-w-[200px] items-center gap-2">
                        <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-au-card-2">
                          <i className="absolute inset-y-0 left-0 rounded bg-[#139a52]" style={{ width: `${r.progress}%` }} />
                          <i className="absolute inset-y-0 w-0.5 bg-au-ink" style={{ left: `${r.elapsed}%` }} title="O'tgan vaqt" />
                        </div>
                        <span className="w-[76px] text-xs text-au-muted">
                          {Math.round(r.progress)}% / {Math.round(r.elapsed)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ color: r.late ? 'var(--au-bad)' : undefined }}>{r.late}</td>
                    <td>
                      <span className={cn('sx-pl', HL[r.h][1])}>{HL[r.h][0]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sx-note">
          «Rejadan ortda»: kechikkan vazifalar 20% dan ko‘p yoki progress o‘tgan vaqtdan 25 punktdan ko‘proq orqada. «Xavf ostida»: kamida bitta
          kechikkan vazifa yoki 10 punktdan ko‘proq orqada.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ backlog */
type Patch = (id: string, p: Partial<STask>, msg?: string) => void;
function Backlog({
  stasks,
  spaceById,
  personById,
  today,
  patch,
}: {
  stasks: STask[];
  spaceById: Map<string, PfData['spaces'][number]>;
  personById: Map<string, StrategyPerson>;
  today: string;
  patch: Patch;
}) {
  const ord = { high: 0, med: 1, low: 2 };
  const list = stasks.filter((t) => t.status === 'todo').sort((a, b) => ord[a.priority] - ord[b.priority] || a.end_date.localeCompare(b.end_date));
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Backlog</h3>
          <small>{list.length} ta rejadagi vazifa · ustuvorlik va muddat bo‘yicha</small>
        </div>
        <div className="sx-tw">
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">#</th>
                <th className="l">Vazifa</th>
                <th className="l">Loyiha</th>
                <th className="l">Mas’ul</th>
                <th className="l">Muddat</th>
                <th className="l">Ustuvorlik</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="l">
                    <div className="sx-empty">Backlog bo‘sh</div>
                  </td>
                </tr>
              )}
              {list.map((t, i) => (
                <tr key={t.id} style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }}>
                  <td className="l text-au-faint">{i + 1}</td>
                  <td className="l">
                    <b>{t.title}</b>
                    <div className="text-xs text-au-muted">{WORKSTREAMS[t.workstream].n}</div>
                  </td>
                  <td className="l">{spaceById.get(t.space_id)?.name}</td>
                  <td className="l">
                    <PersonAvatar person={t.assignee_id ? personById.get(t.assignee_id) : undefined} size={24} />
                  </td>
                  <td className="l" style={{ color: isLate(t, today) ? 'var(--au-bad)' : undefined }}>
                    {fmtDay(t.end_date)}
                  </td>
                  <td className="l">
                    <select
                      className="sx-inp !h-[30px] !w-[110px]"
                      value={t.priority}
                      onChange={(e) => patch(t.id, { priority: e.target.value as STask['priority'] })}
                    >
                      {(Object.keys(PRIORITIES) as STask['priority'][]).map((k) => (
                        <option key={k} value={k}>
                          {PRIORITIES[k].n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="sx-btn sm" onClick={() => patch(t.id, { status: 'progress' }, `«${t.title}» sprintga olindi`)}>
                      Ishga olish →
                    </button>
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

/* ------------------------------------------------------------------- sprint */
function Sprint({ stasks, personById, today, patch }: { stasks: STask[]; personById: Map<string, StrategyPerson>; today: string; patch: Patch }) {
  const sp = sprintOf(today);
  const scope = stasks.filter((t) => t.start_date <= sp.to && t.end_date >= sp.from);
  const days = Array.from({ length: 14 }, (_, i) => addDays(sp.from, i));
  const remaining = days.map((d) => (d > today ? NaN : scope.filter((t) => !(t.done_at && d10(t.done_at)! <= d)).length));
  const ideal = days.map((_, i) => Math.round((scope.length * (13 - i)) / 13 * 10) / 10);
  const cols: TaskStatus[] = ['todo', 'progress', 'review', 'done'];
  const doneN = scope.filter((t) => t.status === 'done').length;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Sprint {sp.no}</div>
        <div className="v">
          {doneN} / {scope.length}
        </div>
        <div className="d">
          {fmtDay(sp.from)} – {fmtDay(sp.to)} · {Math.max(0, daysBetween(today, sp.to))} kun qoldi
        </div>
      </div>
      {(['progress', 'review'] as const).map((k) => {
        const n = scope.filter((t) => t.status === k).length;
        return (
          <div key={k} className="sx-card sx-stat s3">
            <div className="l">
              WIP · {STATUSES[k].n} (limit {WIP[k]})
            </div>
            <div className="v" style={{ color: n > WIP[k] ? 'var(--au-bad)' : undefined }}>{n}</div>
            <div className="d">{n > WIP[k] ? 'Limitdan oshgan — yangi ish olmang' : 'Limit ichida'}</div>
          </div>
        );
      })}
      <div className="sx-card sx-stat s3">
        <div className="l">Kechikkan</div>
        <div className="v" style={{ color: scope.some((t) => isLate(t, today)) ? 'var(--au-bad)' : 'var(--au-ok)' }}>
          {scope.filter((t) => isLate(t, today)).length}
        </div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Burndown</h3>
          <small>qolgan vazifalar (bajarilgan vaqti bo‘yicha) vs ideal chiziq</small>
        </div>
        <Chart
          labels={days.map((d) => `${+d.slice(8, 10)}`)}
          height={200}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Ideal', c: '#c9c3b8', v: ideal, kind: 'line', dash: true },
            { n: 'Qolgan', c: '#ff9f1c', v: remaining, kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Sprint taxtasi</h3>
          <small>holatni o‘zgartirish — Strategiya bilan sinxron</small>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {cols.map((c) => (
            <div key={c} className="rounded-2xl border border-au-line bg-au-card-2/50 p-2.5">
              <div className="mb-2 flex items-center gap-2 px-1 text-sm font-bold">
                <span className="size-2.5 rounded-full" style={{ background: STATUSES[c].c }} />
                {STATUSES[c].n}
                <span className="text-xs text-au-faint">{scope.filter((t) => t.status === c).length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {scope
                  .filter((t) => t.status === c)
                  .map((t, i) => (
                    <div key={t.id} className="sx-card !rounded-xl p-2.5" style={{ animation: `sx-rise 0.45s both var(--sx-spring)`, animationDelay: `${i * 30}ms` }}>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <PriorityChip priority={t.priority} />
                        <PersonAvatar person={t.assignee_id ? personById.get(t.assignee_id) : undefined} size={20} />
                      </div>
                      <div className="text-[13px] font-semibold leading-[18px]">{t.title}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={cn('text-[11px] font-semibold', isLate(t, today) ? 'text-au-bad' : 'text-au-muted')}>{fmtDay(t.end_date)}</span>
                        <select
                          className="rounded-md border border-au-line bg-au-card px-1 text-[11px] font-semibold"
                          value={t.status}
                          onChange={(e) => patch(t.id, { status: e.target.value as TaskStatus }, `«${t.title}» → ${STATUSES[e.target.value as TaskStatus].n}`)}
                        >
                          {cols.map((x) => (
                            <option key={x} value={x}>
                              {STATUSES[x].n}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- schedule */
function Schedule({ data, stasks, today }: { data: PfData; stasks: STask[]; today: string }) {
  if (data.spaces.length === 0) return <div className="sx-card sx-empty mt-4">Loyiha yo‘q</div>;
  const from = [...data.spaces.map((s) => s.start_date), ...data.milestones.map((m) => m.date)].sort()[0];
  const to = [...data.spaces.map((s) => s.end_date), ...data.milestones.map((m) => m.date)].sort().at(-1)!;
  const r0 = addDays(from, -7);
  const span = daysBetween(r0, addDays(to, 14));
  const x = (d: string) => (daysBetween(r0, d) / span) * 100;
  const months: { n: string; l: number }[] = [];
  for (let m = r0.slice(0, 7); `${m}-01` <= addDays(to, 14); ) {
    const first = `${m}-01`;
    months.push({ n: `${MONF[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`, l: Math.max(0, x(first)) });
    const [y, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Loyihalar jadvali</h3>
          <small>har loyiha: muddat, progress va muhim sanalar</small>
        </div>
        <div className="relative overflow-x-auto">
          <div className="relative min-w-[720px]">
            <div className="relative mb-2 h-6 border-b border-au-line text-[11px] font-bold text-au-muted">
              {months.map((m) => (
                <span key={m.n} className="absolute top-0 whitespace-nowrap" style={{ left: `${m.l}%` }}>
                  {m.n}
                </span>
              ))}
            </div>
            <div className="relative">
              {today >= r0 && <div className="absolute inset-y-0 z-10 w-0.5 bg-au-bad" style={{ left: `${x(today)}%` }} title="Bugun" />}
              {data.spaces.map((s, i) => {
                const L = stasks.filter((t) => t.space_id === s.id);
                const prog = L.length ? L.reduce((a, t) => a + t.progress, 0) / L.length : 0;
                return (
                  <div key={s.id} className="relative h-14 border-b border-au-line">
                    <span className="absolute top-1 left-1 text-xs font-bold">{s.name}</span>
                    <div
                      className="absolute top-6 h-6 overflow-hidden rounded-lg"
                      style={{
                        left: `${x(s.start_date)}%`,
                        width: `${Math.max(1, x(s.end_date) - x(s.start_date))}%`,
                        background: `color-mix(in srgb, ${s.color} 30%, transparent)`,
                        transformOrigin: 'left',
                        animation: `sx-grow-x 0.8s both var(--sx-ease)`,
                        animationDelay: `${i * 80}ms`,
                      }}
                    >
                      <i className="block h-full" style={{ width: `${prog}%`, background: s.color }} />
                    </div>
                    {data.milestones
                      .filter((m) => m.space_id === s.id)
                      .map((m) => (
                        <span
                          key={m.id}
                          title={`${m.title} · ${fmtDay(m.date)}`}
                          className="absolute top-[26px] size-4 rotate-45 rounded-[3px] bg-au-ink shadow-[0_0_0_2px_var(--au-card)]"
                          style={{ left: `calc(${x(m.date)}% - 8px)` }}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="sx-note">Batafsil vazifa darajasidagi Gantt — Strategiya → Gantt (sudrab muddatni o‘zgartirish mumkin).</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- ALM */
function Alm({ data, personById, today }: { data: PfData; personById: Map<string, StrategyPerson>; today: string }) {
  const open = data.issues.filter((i) => i.status !== 'done');
  const W = weeks(today, 12);
  const created = W.map((w) => data.issues.filter((i) => d10(i.created_at)! >= w.from && d10(i.created_at)! <= w.to).length);
  const resolved = W.map((w) => data.issues.filter((i) => i.resolved_at && d10(i.resolved_at)! >= w.from && d10(i.resolved_at)! <= w.to).length);
  const recent = data.issues.filter((i) => i.resolved_at && daysBetween(d10(i.resolved_at)!, today) <= 90);
  const avg = recent.length ? recent.reduce((a, i) => a + (Date.parse(i.resolved_at!) - Date.parse(i.created_at)) / 864e5, 0) / recent.length : null;
  const oldest = [...open].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 8);
  const res30 = data.issues.filter((i) => i.resolved_at && daysBetween(d10(i.resolved_at)!, today) <= 30).length;
  const new30 = data.issues.filter((i) => daysBetween(d10(i.created_at)!, today) <= 30).length;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Ochiq muammolar</div>
        <div className="v">{open.length}</div>
        <div className="d">Muammolar bo‘limidan</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">30 kunda hal qilindi</div>
        <div className="v">{res30}</div>
        <div className="d">{new30} ta yangi tushdi</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">O‘rtacha hal qilish vaqti</div>
        <div className="v">{avg === null ? '—' : `${avg.toFixed(1)} kun`}</div>
        <div className="d">oxirgi 90 kun</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Hal qilish ulushi (30 kun)</div>
        <div className="v">{new30 ? pct(Math.min(1, res30 / new30)) : '—'}</div>
      </div>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Tushgan vs hal qilingan</h3>
          <small>haftalik · 12 hafta</small>
        </div>
        <Chart
          labels={W.map((w) => fmtDay(w.from))}
          height={210}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Tushdi', c: '#e8567a', v: created },
            { n: 'Hal qilindi', c: '#139a52', v: resolved },
          ]}
        />
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Eng eski ochiq muammolar</h3>
        </div>
        {oldest.length === 0 ? (
          <div className="sx-empty">Ochiq muammo yo‘q ✓</div>
        ) : (
          <div className="flex flex-col gap-2">
            {oldest.map((i) => (
              <div key={i.id} className="flex items-center gap-2 text-sm">
                <PersonAvatar person={i.assigned_to ? personById.get(i.assigned_to) : undefined} size={22} />
                <span className="flex-1 truncate font-semibold">{i.title}</span>
                <span className="sx-pl bad">{daysBetween(d10(i.created_at)!, today)} kun</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- review */
function Review({ data, personById, today }: { data: PfData; personById: Map<string, StrategyPerson>; today: string }) {
  const T = data.tasks;
  const waiting = T.filter((t) => t.status === 'submitted');
  const upload = T.filter((t) => t.status === 'awaiting_upload');
  const overdue = T.filter((t) => t.status !== 'done' && t.deadline && d10(t.deadline)! < today);
  const done30 = T.filter((t) => t.status === 'done' && t.completed_at && daysBetween(d10(t.completed_at)!, today) <= 30);
  // Instant comparison, same definition as lib/task-efficiency.ts (`completed_at <= deadline`).
  const onTime = done30.filter((t) => !t.deadline || Date.parse(t.completed_at!) <= Date.parse(t.deadline));
  const reviewed = done30.filter((t) => t.submitted_at);
  const avgReview = reviewed.length ? reviewed.reduce((a, t) => a + (Date.parse(t.completed_at!) - Date.parse(t.submitted_at!)) / 36e5, 0) / reviewed.length : null;
  const name = (id: string | null) => {
    const p = id ? personById.get(id) : undefined;
    return p ? `${p.first_name} ${p.last_name}` : '—';
  };
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Tasdiq kutmoqda</div>
        <div className="v">{waiting.length}</div>
        <div className="d">Vazifalar bo‘limida «Tekshiruvda»</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">O‘rtacha tasdiqlash vaqti</div>
        <div className="v">{avgReview === null ? '—' : avgReview < 48 ? `${avgReview.toFixed(1)} soat` : `${(avgReview / 24).toFixed(1)} kun`}</div>
        <div className="d">oxirgi 30 kun</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">O‘z vaqtida bajarilgan</div>
        <div className="v">{done30.length ? pct(onTime.length / done30.length) : '—'}</div>
        <div className="d">{done30.length} ta bajarildi (30 kun)</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Muddati o‘tgan</div>
        <div className="v" style={{ color: overdue.length ? 'var(--au-bad)' : 'var(--au-ok)' }}>{overdue.length}</div>
        <div className="d">{upload.length} ta fayl kutmoqda</div>
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Tasdiqlash navbati</h3>
          <small>xodim topshirgan, rahbar tasdig‘ini kutayotgan vazifalar</small>
        </div>
        {waiting.length === 0 ? (
          <div className="sx-empty">Navbat bo‘sh ✓</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Vazifa</th>
                  <th className="l">Xodim</th>
                  <th className="l">Topshirildi</th>
                  <th className="l">Muddat</th>
                  <th>Kutmoqda</th>
                </tr>
              </thead>
              <tbody>
                {[...waiting]
                  .sort((a, b) => (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''))
                  .map((t, i) => (
                    <tr key={t.id} style={{ animationDelay: `${i * 25}ms` }}>
                      <td className="l">
                        <b>{t.title}</b>
                      </td>
                      <td className="l">{name(t.assigned_to)}</td>
                      <td className="l">{t.submitted_at ? fmtDay(d10(t.submitted_at)!) : '—'}</td>
                      <td className="l">{t.deadline ? fmtDay(d10(t.deadline)!) : '—'}</td>
                      <td>{t.submitted_at ? `${Math.max(0, daysBetween(d10(t.submitted_at)!, today))} kun` : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ reports */
function Reports({ data, stasks, personById, today }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string }) {
  const W = weeks(today, 12);
  const inW = (s: string | null, w: { from: string; to: string }) => !!s && d10(s)! >= w.from && d10(s)! <= w.to;
  const strat = W.map((w) => stasks.filter((t) => inW(t.done_at, w)).length);
  const ops = W.map((w) => data.tasks.filter((t) => t.status === 'done' && inW(t.completed_at, w)).length);
  const since = addDays(today, -30);
  const per = new Map<string, number>();
  stasks.forEach((t) => t.done_at && t.assignee_id && d10(t.done_at)! >= since && per.set(t.assignee_id, (per.get(t.assignee_id) ?? 0) + 1));
  data.tasks.forEach((t) => t.status === 'done' && t.completed_at && t.assigned_to && d10(t.completed_at)! >= since && per.set(t.assigned_to, (per.get(t.assigned_to) ?? 0) + 1));
  const top = [...per.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const doneS = stasks.filter((t) => t.done_at);
  const onTimeS = doneS.filter((t) => d10(t.done_at)! <= t.end_date);
  const thr = strat.map((v, i) => v + ops[i]);
  const avg = thr.reduce((a, b) => a + b, 0) / thr.length;
  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s4">
        <div className="l">Haftalik o‘rtacha unumdorlik</div>
        <div className="v">{avg.toFixed(1)}</div>
        <div className="d">bajarilgan vazifa / hafta (12 hafta)</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Strategiya — o‘z vaqtida</div>
        <div className="v">{doneS.length ? pct(onTimeS.length / doneS.length) : '—'}</div>
        <div className="d">{doneS.length} ta bajarilgan</div>
      </div>
      <div className="sx-card sx-stat s4">
        <div className="l">Shu hafta</div>
        <div className="v">{thr.at(-1)}</div>
        <div className="d">o‘tgan hafta: {thr.at(-2)}</div>
      </div>
      <div className="sx-card s8">
        <div className="sx-h">
          <h3>Throughput</h3>
          <small>haftalik bajarilganlar</small>
        </div>
        <Chart
          labels={W.map((w) => fmtDay(w.from))}
          height={210}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Strategiya vazifalari', c: '#ff9f1c', v: strat },
            { n: 'Kundalik vazifalar', c: '#2477c9', v: ops },
            { n: 'Jami', c: '#17161a', v: thr, kind: 'line' },
          ]}
        />
      </div>
      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Eng faol xodimlar</h3>
          <small>30 kun</small>
        </div>
        {top.length === 0 ? (
          <div className="sx-empty">Ma’lumot yo‘q</div>
        ) : (
          <HBars
            fmt={(v) => `${v}`}
            rows={top.map(([id, v], i) => {
              const p = personById.get(id);
              return { n: p ? `${p.first_name} ${p.last_name}` : '—', v, c: ['#ff9f1c', '#2477c9', '#e8567a', '#7a5af8', '#139a52'][i % 5] };
            })}
          />
        )}
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Holat bo‘yicha (Strategiya)</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUSES) as TaskStatus[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-2">
              <StatusChip status={k} />
              <b>{stasks.filter((t) => t.status === k).length}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
