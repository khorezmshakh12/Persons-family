'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { BarChart3, Briefcase, CalendarRange, CheckCheck, ListTodo, ShieldCheck, Zap } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
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
  progressForStatus,
  budgetTotals,
  type StrategyPerson,
  type StrategySpace,
  type StrategyTask,
  type TaskStatus,
} from '@/lib/strategy';
import { saveStrategyTaskAction } from '@/lib/actions/strategy';
import {
  commentChangeRequestAction,
  createChangeRequestAction,
  decideChangeRequestAction,
  deleteTestCaseAction,
  runTestCaseAction,
  saveSprintGoalAction,
  saveTestCaseAction,
} from '@/lib/actions/perforce';
import {
  burndown,
  cumulativeFlow,
  readiness,
  sprintByNo,
  sprintOf,
  traceability,
  velocity,
  velocityForecast,
  weightedProgress,
  workload,
  type PTask,
  type TestCase,
  type TestResult,
} from '@/lib/perforce';
import { tashkentDayKey } from '@/lib/time';
import { SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { Chart, HBars } from './charts';
import { PersonAvatar, PriorityChip, StatusChip } from './bits';
import './strategy.css';
import './suite.css';

type STask = StrategyTask & { created_at: string; done_at: string | null };
export type PfData = {
  spaces: { id: string; name: string; color: string; start_date: string; end_date: string; budget: StrategySpace['budget'] }[];
  stasks: STask[];
  tasks: { id: string; title: string; status: string; assigned_to: string | null; created_at: string; deadline: string | null; submitted_at: string | null; completed_at: string | null }[];
  issues: { id: string; title: string; status: string; assigned_to: string | null; created_at: string; resolved_at: string | null }[];
  people: StrategyPerson[];
  milestones: { id: string; space_id: string; title: string; date: string }[];
  tests: (TestCase & { run_at: string | null })[];
  crs: CR[];
  crComments: { id: string; cr_id: string; author_id: string | null; body: string; created_at: string }[];
  crVotes: { cr_id: string; voter_id: string }[];
  goals: { sprint_no: number; goal: string }[];
};
type CRStatus = 'needs' | 'review' | 'approved' | 'rejected' | 'submitted';
type CR = {
  id: string;
  space_id: string | null;
  stask_id: string | null;
  title: string;
  description: string;
  status: CRStatus;
  author_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

type Tab = 'port' | 'back' | 'sprint' | 'sched' | 'alm' | 'review' | 'rep';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'port', n: 'Portfel', Icon: Briefcase },
  { v: 'back', n: 'Backlog', Icon: ListTodo },
  { v: 'sprint', n: 'Sprint', Icon: Zap },
  { v: 'sched', n: 'Reja (Gantt)', Icon: CalendarRange },
  { v: 'alm', n: 'ALM · Sifat', Icon: ShieldCheck },
  { v: 'review', n: 'Review & tasdiq', Icon: CheckCheck },
  { v: 'rep', n: 'Hisobotlar', Icon: BarChart3 },
];
const KEY = 'persons-pf-tab';
const WIP = { progress: 4, review: 3 } as const;
/** Tashkent calendar day of a timestamptz string. The raw wire value is in
 * the DB session's zone (UTC), so `.slice(0, 10)` put anything stamped
 * 00:00–05:00 Tashkent on the previous day (wrong week/sprint bucket, and
 * compared against the Tashkent `today`). */
const d10 = (s: string | null) => (s ? tashkentDayKey(new Date(s)) : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const toP = (t: STask): PTask => ({ id: t.id, start_date: t.start_date, end_date: t.end_date, status: t.status, done: d10(t.done_at), created: d10(t.created_at)!, assignee_id: t.assignee_id, space_id: t.space_id });
const ERR = (c: string) => (c === 'forbidden' ? "Ruxsat yo'q" : c === 'invalidInput' ? "Ma'lumot noto'g'ri" : c === 'conflict' ? 'Holat allaqachon o‘zgargan' : "Saqlab bo'lmadi");

/** Run a Server Action, toast the outcome and refresh the page data. */
function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(ERR(r.error));
      if (ok) toast.success(ok);
      after?.();
      router.refresh();
    });
  return { act, pending };
}

/** Start work on a backlog task: status → in progress, and if its dates miss
 * the current sprint, pull them in so it shows on the sprint board. */
function takeIntoSprint(t: Pick<STask, 'start_date' | 'end_date'>, today: string): Partial<STask> {
  const sp = sprintOf(today);
  if (t.start_date <= sp.to && t.end_date >= sp.from) return { status: 'progress' };
  const start = t.start_date > sp.to ? today : t.start_date;
  const end = t.end_date < sp.from || t.end_date < start ? sp.to : t.end_date;
  return { status: 'progress', start_date: start, end_date: end };
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
    if (p.status) next.progress = progressForStatus(prev, p.status);
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
          {tab === 'back' && <Backlog data={data} stasks={stasks} spaceById={spaceById} personById={personById} today={today} patch={patch} />}
          {tab === 'sprint' && <Sprint data={data} stasks={stasks} personById={personById} today={today} patch={patch} />}
          {tab === 'sched' && <Schedule data={data} stasks={stasks} today={today} />}
          {tab === 'alm' && <Alm data={data} stasks={stasks} personById={personById} today={today} />}
          {tab === 'review' && <Review data={data} stasks={stasks} personById={personById} today={today} />}
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
      <PortfolioCards data={data} rows={rows} today={today} />
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Portfel salomatligi</h3>
          <small>progress vs o‘tgan vaqt · kechikkan vazifalar ulushi</small>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">Strategiyada maydon yo‘q — <Link className="font-semibold text-au-accent-text underline" href="/strategy">Strategiya</Link> bo‘limida maydon yarating.</div>
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

/** Portfolio header strip + one card per project (progress ring, budget
 * plan/fact from the Strategy space budget, EVM CPI, open issues). */
function PortfolioCards({ data, rows, today }: { data: PfData; rows: ({ s: PfData['spaces'][number] } & ReturnType<typeof health>)[]; today: string }) {
  if (!rows.length) return null;
  const sp = sprintOf(today);
  const bt = rows.map((r) => ({ r, b: budgetTotals(r.s.budget ?? []) }));
  const plan = bt.reduce((a, x) => a + x.b.plan, 0);
  const act = bt.reduce((a, x) => a + x.b.act, 0);
  const wp = weightedProgress(bt.map((x) => ({ progress: x.r.progress, tasks: x.r.n, budget: x.b.plan })));
  const openIssues = data.issues.filter((i) => i.status !== 'done').length;
  const goal = data.goals.find((g) => g.sprint_no === sp.no)?.goal;
  const cnt = (h: 'on' | 'risk' | 'off') => rows.filter((r) => r.h === h).length;
  const hero = [
    { l: `Portfel · ${rows.length} loyiha`, v: `${Math.round(wp)}%`, d: plan > 0 ? 'vaznli bajarilish (byudjet bo‘yicha)' : 'vaznli bajarilish (vazifalar bo‘yicha)' },
    { l: 'Byudjet', v: plan > 0 ? `${+act.toFixed(1)} / ${+plan.toFixed(1)} mln` : '—', d: plan > 0 ? `${pct(act / plan)} sarflangan` : 'Strategiya → Byudjetda kiriting' },
    { l: 'Faol sprint', v: `Sprint ${sp.no}`, d: goal ?? `${fmtDay(sp.from)} – ${fmtDay(sp.to)}` },
    { l: 'Ochiq xatolar', v: String(openIssues), d: 'Muammolar bo‘limidan' },
  ];
  return (
    <>
      <div className="sx-card s12">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {hero.map((h) => (
            <div key={h.l}>
              <div className="text-[11px] font-bold text-au-muted uppercase">{h.l}</div>
              <div className="text-2xl font-extrabold tabular-nums">{h.v}</div>
              <div className="truncate text-xs text-au-muted">{h.d}</div>
            </div>
          ))}
          <div>
            <div className="text-[11px] font-bold text-au-muted uppercase">Holat</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span className="sx-pl ok">{cnt('on')} rejada</span>
              <span className="sx-pl warn">{cnt('risk')} xavf</span>
              <span className="sx-pl bad">{cnt('off')} ortda</span>
            </div>
            <div className="text-xs text-au-muted">RAG ko‘rsatkichi</div>
          </div>
        </div>
      </div>
      {bt.map(({ r, b }, i) => {
        const burn = b.plan > 0 ? (b.act / b.plan) * 100 : null;
        const cpi = burn ? r.progress / burn : null;
        const col = r.h === 'on' ? 'var(--au-ink)' : r.h === 'risk' ? '#ff9f1c' : 'var(--au-bad)';
        return (
          <div key={r.s.id} className="sx-card s4" style={{ animation: 'sx-rise 0.45s both var(--sx-spring)', animationDelay: `${i * 40}ms` }}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className={cn('sx-pl', HL[r.h][1])}>{HL[r.h][0]}</span>
              <span className="text-xs text-au-muted">{r.n} vazifa</span>
            </div>
            <h4 className="mb-2 truncate font-bold">
              <span className="mr-1.5 inline-block size-2.5 rounded" style={{ background: r.s.color }} />
              {r.s.name}
            </h4>
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 36 36" className="size-14 shrink-0">
                <circle cx="18" cy="18" r="15" fill="none" stroke="var(--au-card-2)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={col} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(r.progress / 100) * 94.2} 94.2`} transform="rotate(-90 18 18)" />
                <text x="18" y="21" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--au-ink)">
                  {Math.round(r.progress)}%
                </text>
              </svg>
              <div className="grid flex-1 grid-cols-2 gap-1 text-xs">
                <div>
                  <span className="text-au-muted">Byudjet</span>
                  <b className="block">{b.plan > 0 ? `${+b.act.toFixed(1)}/${+b.plan.toFixed(1)} mln` : '—'}</b>
                </div>
                <div>
                  <span className="text-au-muted">CPI</span>
                  <b className="block" style={{ color: cpi === null ? undefined : cpi >= 1 ? 'var(--au-ok)' : 'var(--au-bad)' }}>{cpi === null ? '—' : cpi.toFixed(2)}</b>
                </div>
                <div>
                  <span className="text-au-muted">Muddat</span>
                  <b className="block">{fmtDay(r.s.end_date)}</b>
                </div>
                <div>
                  <span className="text-au-muted">Kechikkan</span>
                  <b className="block" style={{ color: r.late ? 'var(--au-bad)' : undefined }}>{r.late}</b>
                </div>
              </div>
            </div>
            {burn !== null && (
              <>
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-au-card-2">
                  <i className="block h-full rounded" style={{ width: `${Math.min(100, burn)}%`, background: burn > r.progress + 10 ? 'var(--au-bad)' : 'var(--au-faint)' }} />
                </div>
                <div className="mt-1 text-[11px] text-au-muted">Byudjet sarfi {Math.round(burn)}% · bajarilish {Math.round(r.progress)}%</div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ backlog */
type Patch = (id: string, p: Partial<STask>, msg?: string) => void;
function Backlog({
  data,
  stasks,
  spaceById,
  personById,
  today,
  patch,
}: {
  data: PfData;
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
                    <div className="sx-empty">Backlog bo‘sh — «Rejada» holatidagi vazifalar shu yerda chiqadi. Yangi vazifani <Link className="font-semibold text-au-accent-text underline" href="/strategy">Strategiya</Link> bo‘limida qo‘shing.</div>
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
                    <button className="sx-btn sm whitespace-nowrap" onClick={() => patch(t.id, takeIntoSprint(t, today), `«${t.title}» sprintga olindi`)}>
                      Ishga olish →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <SprintCapacity data={data} stasks={stasks} personById={personById} today={today} />
    </div>
  );
}

/** Sprint backlog capacity (vs recent velocity), per-person load and
 * per-project (epic) completion. */
function SprintCapacity({ data, stasks, personById, today }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string }) {
  const sp = sprintOf(today);
  const P = stasks.map(toP);
  const scope = P.filter((t) => t.start_date <= sp.to && t.end_date >= sp.from);
  const vel = velocity(P, sp.no - 1, 3);
  const avg = vel.length ? vel.reduce((a, v) => a + v.done, 0) / vel.length : 0;
  const cap = Math.max(1, Math.round(avg));
  const open = scope.filter((t) => t.status !== 'done').length;
  const wl = workload(scope, avg);
  return (
    <>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Sprint {sp.no}</h3>
          <small>
            {fmtDay(sp.from)} – {fmtDay(sp.to)} · sprint backlog
          </small>
        </div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span>
            Sig‘im: <b>{open} / {cap}</b> ochiq vazifa (oxirgi 3 sprint o‘rtacha tezligi)
          </span>
          <span className={cn('sx-pl', open > cap ? 'bad' : open > cap * 0.85 ? 'warn' : 'ok')}>{open > cap ? 'Ortiqcha yuklama' : open > cap * 0.85 ? 'To‘la' : 'Joy bor'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-au-card-2">
          <i className="block h-full rounded" style={{ width: `${Math.min(100, (open / cap) * 100)}%`, background: open > cap ? 'var(--au-bad)' : 'var(--au-ink)' }} />
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {wl.rows.length === 0 && <div className="sx-empty">Sprintda mas’ul biriktirilgan vazifa yo‘q</div>}
          {wl.rows.map((r) => {
            const pp = personById.get(r.id);
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <PersonAvatar person={pp} size={22} />
                <span className="w-[120px] truncate">{pp ? `${pp.first_name} ${pp.last_name}` : '—'}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-au-card-2">
                  <i className="block h-full rounded" style={{ width: `${Math.min(100, ((r.total - r.done) / wl.cap) * 100)}%`, background: r.over ? 'var(--au-bad)' : '#2477c9' }} />
                </div>
                <b className="w-[40px] text-right tabular-nums">{r.total - r.done}</b>
                {r.over && <span className="sx-pl bad">Ortiqcha</span>}
              </div>
            );
          })}
        </div>
        <p className="sx-note">Bir kishiga sig‘im: {wl.cap} ta ochiq vazifa (o‘rtacha tezlik / mas’ullar soni, kamida 3).</p>
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Epiklar (loyihalar) bo‘yicha</h3>
          <small>bajarilgan / jami vazifa</small>
        </div>
        <div className="flex flex-col gap-2">
          {data.spaces.map((s) => {
            const a = stasks.filter((t) => t.space_id === s.id);
            const d = a.filter((t) => t.status === 'done').length;
            return (
              <div key={s.id} className="flex items-center gap-2 text-sm">
                <span className="w-[150px] truncate">{s.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-au-card-2">
                  <i className="block h-full rounded" style={{ width: `${a.length ? (d / a.length) * 100 : 0}%`, background: s.color }} />
                </div>
                <b className="w-[50px] text-right tabular-nums">
                  {d}/{a.length}
                </b>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- sprint */
function Sprint({ data, stasks, personById, today, patch }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string; patch: Patch }) {
  const sp = sprintOf(today);
  const scope = stasks.filter((t) => t.start_date <= sp.to && t.end_date >= sp.from);
  const days = Array.from({ length: 14 }, (_, i) => addDays(sp.from, i));
  const B = burndown(scope.map(toP), days, today);
  const dayNo = Math.min(14, Math.max(1, daysBetween(sp.from, today) + 1));
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
      <SprintGoal key={sp.no} no={sp.no} goal={data.goals.find((g) => g.sprint_no === sp.no)?.goal ?? ''} dayNo={dayNo} onTrack={B.onTrack} remaining={B.remaining} />
      <div className="sx-card s7">
        <div className="sx-h">
          <h3>Burndown</h3>
          <small>qolgan vazifalar · ideal, fakt va joriy tezlikda prognoz</small>
        </div>
        <Chart
          labels={days.map((d) => `${+d.slice(8, 10)}`)}
          height={220}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Ideal', c: '#c9c3b8', v: B.ideal, kind: 'line', dash: true },
            { n: 'Fakt', c: '#ff9f1c', v: B.actual, kind: 'line' },
            { n: 'Prognoz (joriy tezlikda)', c: '#17161a', v: B.forecast, kind: 'line', dash: true },
          ]}
        />
      </div>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Jamoa yuklamasi</h3>
          <small>sprint ichida · bajarilgan / jami</small>
        </div>
        <div className="flex flex-col gap-2.5">
          {workload(scope.map(toP), 0).rows.map((r) => {
            const pp = personById.get(r.id);
            return (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <PersonAvatar person={pp} size={26} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate">{pp ? `${pp.first_name} ${pp.last_name}` : '—'}</b>
                  <div className="h-1.5 overflow-hidden rounded bg-au-card-2">
                    <i className="block h-full rounded bg-[#139a52]" style={{ width: `${r.total ? (r.done / r.total) * 100 : 0}%` }} />
                  </div>
                </div>
                <span className="text-xs tabular-nums text-au-muted">
                  {r.done}/{r.total}
                </span>
              </div>
            );
          })}
          {!scope.some((t) => t.assignee_id) && <div className="sx-empty">Mas’ul biriktirilmagan</div>}
        </div>
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

/** Sprint goal (editable) + burndown status. */
function SprintGoal({ no, goal, dayNo, onTrack, remaining }: { no: number; goal: string; dayNo: number; onTrack: boolean; remaining: number }) {
  const { act, pending } = useAct();
  const [v, setV] = useState(goal);
  return (
    <div className="sx-card s12">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[240px] flex-1">
          <div className="text-[11px] font-bold text-au-muted uppercase">Sprint {no} · maqsad</div>
          <input
            className="sx-plain-inp !w-full text-base font-bold"
            maxLength={300}
            placeholder="Sprint maqsadini yozing…"
            value={v}
            disabled={pending}
            onChange={(e) => setV(e.target.value)}
            onBlur={() => v.trim() !== goal && act(() => saveSprintGoalAction({ sprintNo: no, goal: v.trim() }), 'Sprint maqsadi saqlandi')}
          />
          <div className="text-xs text-au-muted">{dayNo}-kun / 14</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-au-muted uppercase">Holat</div>
          <span className={cn('sx-pl', onTrack ? 'ok' : 'warn')}>{onTrack ? 'Grafikda' : 'Ortda qolmoqda'}</span>
          <div className="text-xs text-au-muted">burndown bo‘yicha · qolgan {remaining}</div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- schedule */
function Schedule({ data, stasks, today }: { data: PfData; stasks: STask[]; today: string }) {
  if (data.spaces.length === 0) return <div className="sx-card sx-empty mt-4">Loyiha yo‘q — <Link className="font-semibold text-au-accent-text underline" href="/strategy">Strategiya</Link> bo‘limida maydon yarating.</div>;
  const from = [...data.spaces.map((s) => s.start_date), ...data.milestones.map((m) => m.date)].sort()[0];
  const to = [...data.spaces.map((s) => s.end_date), ...data.milestones.map((m) => m.date)].sort().at(-1)!;
  const r0 = addDays(from, -7);
  const span = daysBetween(r0, addDays(to, 14));
  const x = (d: string) => (daysBetween(r0, d) / span) * 100;
  const cur = sprintOf(today).no;
  const firstNo = Math.max(1, sprintOf(r0).no);
  const sprints = Array.from({ length: Math.max(0, sprintOf(addDays(to, 14)).no - firstNo + 1) }, (_, i) => sprintByNo(firstNo + i)).filter((q) => q.to >= r0);
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
          <h3>Agile jadval</h3>
          <small>sprintlar, loyihalar (epiklar) va relizlar</small>
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
              <div className="relative h-9 border-b border-au-line">
                <span className="absolute top-0 left-1 text-[11px] font-bold text-au-muted">Sprintlar</span>
                {sprints.map((q) => (
                  <span
                    key={q.no}
                    title={`Sprint ${q.no} · ${fmtDay(q.from)} – ${fmtDay(q.to)}`}
                    className={cn(
                      'absolute top-4 flex h-4 items-center justify-center overflow-hidden rounded text-[10px] font-bold',
                      q.no < cur ? 'bg-au-card-2 text-au-faint' : q.no === cur ? 'bg-au-ink text-au-card' : 'border border-au-line text-au-muted',
                    )}
                    style={{ left: `${Math.max(0, x(q.from))}%`, width: `calc(${x(addDays(q.to, 1)) - Math.max(0, x(q.from))}% - 2px)` }}
                  >
                    S{q.no}
                  </span>
                ))}
              </div>
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
        <p className="sx-note">Batafsil vazifa darajasidagi Gantt — Strategiya → Gantt (sudrab muddatni o‘zgartirish mumkin). Olmos — relizlar (muhim sanalar).</p>
      </div>
      <Releases data={data} stasks={stasks} today={today} />
    </div>
  );
}

/** Release readiness per upcoming milestone and the velocity forecast. */
function Releases({ data, stasks, today }: { data: PfData; stasks: STask[]; today: string }) {
  const P = stasks.map(toP);
  const sp = sprintOf(today);
  const vel = velocity(P, sp.no - 1, 3);
  const remaining = P.filter((t) => t.status !== 'done').length;
  const f = velocityForecast(vel.map((v) => v.done), remaining, sprintByNo(sp.no + 1).from);
  const openIssues = new Set(data.issues.filter((i) => i.status !== 'done').map((i) => i.id));
  const rel = data.milestones.filter((m) => m.date >= addDays(today, -14)).slice(0, 8);
  const RS = { ready: ['Tayyor bo‘lmoqda', 'ok'], blocked: ['Bloklangan', 'bad'], progress: ['Jarayonda', 'warn'] } as const;
  return (
    <>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Reliz tayyorligi</h3>
          <small>Release readiness · muhim sanalar bo‘yicha</small>
        </div>
        {rel.length === 0 ? (
          <div className="sx-empty">Yaqin muhim sana yo‘q — Strategiyada qo‘shing.</div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {rel.map((m) => {
              const r = readiness(P.filter((t) => t.space_id === m.space_id), data.tests.filter((t) => t.space_id === m.space_id), openIssues);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 border-b border-au-line pb-2 text-sm">
                  <div className="min-w-[160px] flex-1">
                    <b>{m.title}</b>
                    <small className="block text-au-muted">
                      {fmtDay(m.date)} · {data.spaces.find((s) => s.id === m.space_id)?.name}
                    </small>
                  </div>
                  <span className="text-xs text-au-muted">
                    Vazifa {r.done}/{r.total} · Test {r.pass}/{r.tests} · <span style={{ color: r.bugs ? 'var(--au-bad)' : undefined }}>Xato {r.bugs}</span>
                  </span>
                  <span className={cn('sx-pl', RS[r.state][1])}>{RS[r.state][0]}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Tezlik prognozi</h3>
          <small>Velocity forecast</small>
        </div>
        <p className="mb-3 text-sm text-au-muted">
          Oxirgi 3 sprint o‘rtacha tezligi: <b className="text-au-ink">{f.avg.toFixed(1)} vazifa</b> ({vel.map((v) => v.done).join(' · ') || '—'}). Qolgan ish: <b className="text-au-ink">{remaining} vazifa</b>.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['Pessimistik', f.pessimistic],
              ['O‘rtacha', f.average],
              ['Optimistik', f.optimistic],
            ] as const
          ).map(([n, x]) => (
            <div key={n} className="rounded-xl border border-au-line bg-au-card-2 p-3">
              <small className="text-au-muted">
                {n}
                {x ? ` · ${x.rate}/sprint` : ''}
              </small>
              <b className="block text-lg">{x ? `${x.sprints} sprint` : '—'}</b>
              <span className="text-xs text-au-muted">{x ? `≈ ${fmtDay(x.finish)}` : 'tezlik 0'}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- ALM */
function Alm({ data, stasks, personById, today }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string }) {
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
      <TestCases data={data} stasks={stasks} />
    </div>
  );
}

const TR: Record<TestResult, [string, string, string]> = {
  pass: ['O‘tdi', 'ok', '#139a52'],
  fail: ['Yiqildi', 'bad', '#c7322b'],
  blocked: ['Bloklangan', 'warn', '#ff9f1c'],
  none: ['Bajarilmagan', 'mute', '#e4ddd2'],
};

/** ALM test cases traced to Strategy tasks (requirements). */
function TestCases({ data, stasks }: { data: PfData; stasks: STask[] }) {
  const { act, pending } = useAct();
  const [space, setSpace] = useState(data.spaces[0]?.id ?? '');
  const [view, setView] = useState<'mx' | 'tc'>('mx');
  const [f, setF] = useState({ title: '', req: '' });
  const openIssues = new Set(data.issues.filter((i) => i.status !== 'done').map((i) => i.id));
  const issueById = new Map(data.issues.map((i) => [i.id, i]));
  const reqs = stasks.filter((t) => t.space_id === space);
  const tests = data.tests.filter((t) => t.space_id === space);
  const tr = traceability(reqs, tests, openIssues);
  const cnt = (k: TestResult) => tests.filter((t) => t.result === k).length;
  const bugs = tests.filter((t) => t.issue_id && openIssues.has(t.issue_id)).length;
  const ST = { gap: ['Test yo‘q', 'bad'], ok: ['Tasdiqlangan', 'ok'], bad: ['Muammo', 'bad'], warn: ['Jarayonda', 'warn'] } as const;
  if (!data.spaces.length) return null;
  return (
    <div className="sx-card s12">
      <div className="sx-h">
        <h3>Sifat · talab → test → xato</h3>
        <small>talab = Strategiya vazifasi</small>
        <span className="sp" />
        <select className="sx-inp !h-[32px] !w-[200px]" value={space} onChange={(e) => setSpace(e.target.value)}>
          {data.spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div>
          <div className="text-[11px] font-bold text-au-muted uppercase">Talablar qamrovi</div>
          <b className="text-2xl">{reqs.length ? pct(tr.coverage) : '—'}</b>
          <div className="text-xs text-au-muted">{tr.rows.filter((r) => r.st === 'gap').length} talabda test yo‘q</div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-au-muted uppercase">Test natijalari</div>
          <b className="text-2xl">
            {cnt('pass')}/{tests.length}
          </b>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded bg-au-card-2">
            {(['pass', 'fail', 'blocked', 'none'] as const).map((k) => (
              <i key={k} style={{ flex: cnt(k), background: TR[k][2] }} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-au-muted uppercase">Ochiq xatolar (testdan)</div>
          <b className="text-2xl" style={{ color: bugs ? 'var(--au-bad)' : undefined }}>
            {bugs}
          </b>
        </div>
        <div>
          <div className="text-[11px] font-bold text-au-muted uppercase">Sifat indeksi</div>
          <b className="text-2xl">{tests.length || reqs.length ? tr.quality : '—'}</b>
          <div className="text-xs text-au-muted">100 dan · 70% test + 30% qamrov</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <button className={cn('sx-chipb', view === 'mx' && 'on')} onClick={() => setView('mx')}>
          Kuzatuv matritsasi
        </button>
        <button className={cn('sx-chipb', view === 'tc' && 'on')} onClick={() => setView('tc')}>
          Test holatlari
        </button>
        <span className="flex-1" />
        <input className="sx-inp !h-[32px] !w-[240px]" maxLength={300} placeholder="Yangi test holati…" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <select className="sx-inp !h-[32px] !w-[200px]" value={f.req} onChange={(e) => setF({ ...f, req: e.target.value })}>
          <option value="">Talab (vazifa) tanlang…</option>
          {reqs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
        <button
          className="sx-btn primary sm"
          disabled={pending || !f.title.trim()}
          onClick={() => act(() => saveTestCaseAction({ spaceId: space, staskId: f.req || null, title: f.title }), 'Test holati qo‘shildi', () => setF({ title: '', req: f.req }))}
        >
          Qo‘shish
        </button>
      </div>
      <div className="sx-tw mt-3">
        {view === 'mx' ? (
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Talab</th>
                <th className="l">Testlar</th>
                <th>Qamrov</th>
                <th>Xato</th>
                <th>Holat</th>
              </tr>
            </thead>
            <tbody>
              {tr.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="l">
                    <div className="sx-empty">Bu loyihada vazifa yo‘q</div>
                  </td>
                </tr>
              )}
              {tr.rows.map((r) => (
                <tr key={r.id}>
                  <td className="l">{reqs.find((t) => t.id === r.id)?.title}</td>
                  <td className="l">
                    <span className="inline-flex flex-wrap gap-1">
                      {r.tests.map((t) => (
                        <i key={t.id} title={`${t.title}: ${TR[t.result][0]}`} className="inline-block size-3 rounded-full" style={{ background: TR[t.result][2] }} />
                      ))}
                    </span>
                  </td>
                  <td>
                    {r.pass}/{r.tests.length}
                  </td>
                  <td style={{ color: r.bugs ? 'var(--au-bad)' : undefined }}>{r.bugs || '—'}</td>
                  <td>
                    <span className={cn('sx-pl', ST[r.st][1])}>{ST[r.st][0]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="sx-tbl">
            <thead>
              <tr>
                <th className="l">Test</th>
                <th className="l">Talab</th>
                <th>Natija</th>
                <th className="l">Xato</th>
                <th>Ishga tushirish</th>
              </tr>
            </thead>
            <tbody>
              {tests.length === 0 && (
                <tr>
                  <td colSpan={5} className="l">
                    <div className="sx-empty">Test holati yo‘q — yuqorida qo‘shing.</div>
                  </td>
                </tr>
              )}
              {tests.map((t) => {
                const iss = t.issue_id ? issueById.get(t.issue_id) : undefined;
                return (
                  <tr key={t.id}>
                    <td className="l">
                      <b>{t.title}</b>
                    </td>
                    <td className="l text-xs">{reqs.find((q) => q.id === t.stask_id)?.title ?? '—'}</td>
                    <td>
                      <span className={cn('sx-pl', TR[t.result][1])}>{TR[t.result][0]}</span>
                    </td>
                    <td className="l text-xs">
                      {iss ? (
                        <Link className="underline" href="/issues">
                          {iss.status === 'done' ? '✓ ' : ''}
                          {iss.title}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className="inline-flex gap-1">
                        {(['pass', 'fail', 'blocked'] as const).map((k) => (
                          <button key={k} className="sx-btn sm" disabled={pending} onClick={() => act(() => runTestCaseAction({ id: t.id, result: k }), `${t.title}: ${TR[k][0]}`)}>
                            {TR[k][0]}
                          </button>
                        ))}
                        <button
                          className="sx-btn sm text-au-bad"
                          disabled={pending}
                          aria-label="O‘chirish"
                          onClick={() => window.confirm(`«${t.title}» o‘chirilsinmi?`) && act(() => deleteTestCaseAction(t.id), 'Test o‘chirildi')}
                        >
                          ×
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="sx-note">«Yiqildi» bosilsa, test bilan bog‘langan yangi xato Muammolar bo‘limida avtomatik yaratiladi (talab mas’uliga biriktiriladi).</p>
    </div>
  );
}

/* ------------------------------------------------------------------- review */
function Review({ data, stasks, personById, today }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string }) {
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
      <ChangeRequests data={data} stasks={stasks} personById={personById} />
    </div>
  );
}

const CRS: Record<CRStatus, [string, string]> = {
  needs: ['Ko‘rib chiqish kerak', 'warn'],
  review: ['Review jarayonida', 'info'],
  approved: ['Tasdiqlangan', 'ok'],
  rejected: ['Rad etildi', 'bad'],
  submitted: ['Qo‘llandi', 'mute'],
};

/** Internal change-request / review log (GitHub is not wired — reviews of
 * process, curriculum, app and site changes are recorded here). */
function ChangeRequests({ data, stasks, personById }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson> }) {
  const { act, pending } = useAct();
  const [sel, setSel] = useState<string | null>(data.crs[0]?.id ?? null);
  const [f, setF] = useState({ title: '', description: '', spaceId: '', staskId: '' });
  const [cm, setCm] = useState('');
  const cr = data.crs.find((c) => c.id === sel) ?? data.crs[0];
  const name = (id: string | null) => {
    const p = id ? personById.get(id) : undefined;
    return p ? `${p.first_name} ${p.last_name}` : '—';
  };
  const votes = cr ? data.crVotes.filter((v) => v.cr_id === cr.id) : [];
  const comments = cr ? data.crComments.filter((c) => c.cr_id === cr.id) : [];
  const decide = (to: 'review' | 'approved' | 'rejected' | 'submitted', msg: string) => cr && act(() => decideChangeRequestAction({ id: cr.id, to }), msg);
  return (
    <>
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>O‘zgarish so‘rovlari</h3>
          <small>{data.crs.length} ta · review jurnali</small>
        </div>
        <div className="mb-3 flex flex-col gap-2 rounded-xl border border-au-line bg-au-card-2 p-3">
          <input className="sx-inp" maxLength={300} placeholder="Nima o‘zgaradi? (masalan: Darslik 3-unit tahriri)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea className="sx-inp !h-[64px] py-2" maxLength={5000} placeholder="Tafsilot / diff / havola" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <select className="sx-inp !h-[32px] flex-1" value={f.spaceId} onChange={(e) => setF({ ...f, spaceId: e.target.value, staskId: '' })}>
              <option value="">Loyiha (ixtiyoriy)</option>
              {data.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select className="sx-inp !h-[32px] flex-1" value={f.staskId} onChange={(e) => setF({ ...f, staskId: e.target.value })} disabled={!f.spaceId}>
              <option value="">Vazifa (ixtiyoriy)</option>
              {stasks
                .filter((t) => t.space_id === f.spaceId)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <button
              className="sx-btn primary sm"
              disabled={pending || !f.title.trim()}
              onClick={() =>
                act(
                  () => createChangeRequestAction({ title: f.title, description: f.description, spaceId: f.spaceId || null, staskId: f.staskId || null }),
                  'So‘rov yaratildi — review kutmoqda',
                  () => setF({ title: '', description: '', spaceId: '', staskId: '' }),
                )
              }
            >
              So‘rov yaratish
            </button>
          </div>
        </div>
        {data.crs.length === 0 ? (
          <div className="sx-empty">Hali so‘rov yo‘q</div>
        ) : (
          <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto">
            {data.crs.map((c) => (
              <button
                key={c.id}
                className={cn('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm', c.id === cr?.id ? 'border-au-ink bg-au-card-2' : 'border-au-line')}
                onClick={() => setSel(c.id)}
              >
                <PersonAvatar person={c.author_id ? personById.get(c.author_id) : undefined} size={20} />
                <span className="min-w-0 flex-1 truncate font-semibold">{c.title}</span>
                <span className={cn('sx-pl', CRS[c.status][1])}>{CRS[c.status][0]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="sx-card s7">
        {!cr ? (
          <div className="sx-empty">So‘rovni tanlang</div>
        ) : (
          <>
            <div className="sx-h">
              <h3 className="truncate">{cr.title}</h3>
              <span className={cn('sx-pl', CRS[cr.status][1])}>{CRS[cr.status][0]}</span>
            </div>
            <div className="mb-2 text-xs text-au-muted">
              {name(cr.author_id)} · {fmtDay(d10(cr.created_at)!)}
              {cr.space_id && ` · ${data.spaces.find((s) => s.id === cr.space_id)?.name ?? ''}`}
              {cr.stask_id && ` · ${stasks.find((t) => t.id === cr.stask_id)?.title ?? ''}`}
              {cr.decided_by && ` · qaror: ${name(cr.decided_by)}`}
            </div>
            {cr.description && <pre className="mb-3 max-h-[220px] overflow-auto rounded-lg bg-au-card-2 p-3 text-xs whitespace-pre-wrap">{cr.description}</pre>}
            {votes.length > 0 && (
              <div className="mb-3 flex items-center gap-1.5 text-xs text-au-muted">
                Tasdiqladi:
                {votes.map((v) => (
                  <PersonAvatar key={v.voter_id} person={personById.get(v.voter_id)} size={22} />
                ))}
              </div>
            )}
            <div className="flex flex-col gap-2">
              {comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2 text-sm">
                  <PersonAvatar person={c.author_id ? personById.get(c.author_id) : undefined} size={22} />
                  <div className="flex-1 rounded-lg bg-au-card-2 px-2.5 py-1.5">
                    <b className="text-xs">{name(c.author_id)}</b>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input className="sx-inp !h-[32px] min-w-[180px] flex-1" maxLength={2000} placeholder="Izoh yozing…" value={cm} onChange={(e) => setCm(e.target.value)} />
              <button className="sx-btn sm" disabled={pending || !cm.trim()} onClick={() => act(() => commentChangeRequestAction({ id: cr.id, body: cm }), 'Izoh qo‘shildi', () => setCm(''))}>
                Izoh
              </button>
              {(cr.status === 'needs' || cr.status === 'rejected') && (
                <button className="sx-btn sm" disabled={pending} onClick={() => decide('review', 'Review boshlandi')}>
                  Review boshlash
                </button>
              )}
              {(cr.status === 'needs' || cr.status === 'review') && (
                <>
                  <button className="sx-btn sm text-au-bad" disabled={pending} onClick={() => decide('rejected', 'So‘rov rad etildi')}>
                    Rad etish
                  </button>
                  <button className="sx-btn primary sm" disabled={pending} onClick={() => decide('approved', 'So‘rov tasdiqlandi')}>
                    Tasdiqlash
                  </button>
                </>
              )}
              {cr.status === 'approved' && (
                <button className="sx-btn primary sm" disabled={pending} onClick={() => decide('submitted', 'O‘zgarish qo‘llandi')}>
                  Qo‘llash (submit)
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
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
      <AgileReports data={data} stasks={stasks} today={today} />
    </div>
  );
}

/** Velocity, cumulative flow and per-project (epic) distribution. */
function AgileReports({ data, stasks, today }: { data: PfData; stasks: STask[]; today: string }) {
  const P = stasks.map(toP);
  const sp = sprintOf(today);
  const vel = velocity(P, sp.no, 6);
  const avg = vel.length ? vel.reduce((a, v) => a + v.done, 0) / vel.length : 0;
  const days = Array.from({ length: 8 }, (_, i) => addDays(today, (i - 7) * 7));
  const cf = cumulativeFlow(P, days);
  return (
    <>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Tezlik (velocity)</h3>
          <small>rejalangan vs bajarilgan vazifa · sprintlar</small>
        </div>
        <Chart
          labels={vel.map((v) => `S${v.no}`)}
          height={220}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Rejalangan', c: '#e4ddd2', v: vel.map((v) => v.planned) },
            { n: 'Bajarilgan', c: '#17161a', v: vel.map((v) => v.done) },
            { n: 'O‘rtacha tezlik', c: '#ff9f1c', v: vel.map(() => avg), kind: 'line', dash: true },
          ]}
        />
      </div>
      <div className="sx-card s6">
        <div className="sx-h">
          <h3>Kumulyativ oqim</h3>
          <small>Cumulative flow · 8 hafta</small>
        </div>
        <Chart
          labels={days.map((d) => fmtDay(d))}
          height={220}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Bajarildi', c: '#139a52', v: cf.map((x) => x.done), kind: 'line' },
            { n: 'Ochiq (jami yaratilgan − bajarilgan)', c: '#2477c9', v: cf.map((x) => x.open), kind: 'line' },
            { n: 'Jami yaratilgan', c: '#a39fa8', v: cf.map((x) => x.open + x.done), kind: 'line', dash: true },
          ]}
        />
      </div>
      <div className="sx-card s12">
        <div className="sx-h">
          <h3>Epiklar (loyihalar) bo‘yicha taqsimot</h3>
          <small>bajarilgan va qolgan vazifalar</small>
        </div>
        <Chart
          labels={data.spaces.map((s) => s.name)}
          height={220}
          fmt={(v) => `${+v.toFixed(1)}`}
          series={[
            { n: 'Bajarilgan', c: '#17161a', v: data.spaces.map((s) => stasks.filter((t) => t.space_id === s.id && t.status === 'done').length) },
            { n: 'Qolgan', c: '#e4ddd2', v: data.spaces.map((s) => stasks.filter((t) => t.space_id === s.id && t.status !== 'done').length) },
          ]}
        />
      </div>
    </>
  );
}
