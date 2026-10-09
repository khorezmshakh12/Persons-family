'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Activity, Briefcase, CheckCheck, Pencil, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  STATUSES,
  addDays,
  dayNum,
  daysBetween,
  fmtDay,
  isLate,
  budgetTotals,
  type StrategyPerson,
  type StrategySpace,
  type StrategyTask,
} from '@/lib/strategy';
import {
  commentChangeRequestAction,
  createChangeRequestAction,
  updateChangeRequestAction,
  deleteChangeRequestAction,
  deleteCrCommentAction,
  decideChangeRequestAction,
  deleteTestCaseAction,
  runTestCaseAction,
  saveTestCaseAction,
} from '@/lib/actions/perforce';
import {
  sprintOf,
  traceability,
  weightedProgress,
  type TestCase,
  type TestResult,
} from '@/lib/perforce';
import { tashkentDayKey } from '@/lib/time';
import { ask, SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { Chart } from './charts';
import { RiskRegister, type RiskRow } from './risk-register';
import { PersonAvatar } from './bits';
import { ResourceLoad, StatusBoard, type StatusUpdate } from './perforce-v7';
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
  risks: RiskRow[];
  statuses: StatusUpdate[];
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

// Simplified (owner, 2026-10-04): planning lives in Strategy (Board / Gantt).
type Tab = 'port' | 'status' | 'res' | 'alm' | 'review';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'port', n: 'Portfel', Icon: Briefcase },
  { v: 'status', n: 'Holat', Icon: Activity },
  { v: 'res', n: 'Resurslar', Icon: Users },
  { v: 'alm', n: 'Sifat nazorati', Icon: ShieldCheck },
  { v: 'review', n: 'Review & tasdiq', Icon: CheckCheck },
];
const KEY = 'persons-pf-tab';
/** Tashkent calendar day of a timestamptz string. The raw wire value is in
 * the DB session's zone (UTC), so `.slice(0, 10)` put anything stamped
 * 00:00–05:00 Tashkent on the previous day (wrong week/sprint bucket, and
 * compared against the Tashkent `today`). */
const d10 = (s: string | null) => (s ? tashkentDayKey(new Date(s)) : null);
const pct = (v: number) => `${Math.round(v * 100)}%`;
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


/** Monday-start weeks, `n` of them ending with the week containing `today`. */
function weeks(today: string, n: number) {
  const dow = (new Date(dayNum(today) * 864e5).getUTCDay() + 6) % 7;
  const last = addDays(today, -dow);
  return Array.from({ length: n }, (_, i) => {
    const from = addDays(last, (i - n + 1) * 7);
    return { from, to: addDays(from, 6) };
  });
}

export function PerforceWorkspace({ data, today, viewerId }: { data: PfData; today: string; viewerId?: string }) {
  const [tab, setTab] = useState<Tab>('port');
  const stasks = data.stasks;
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
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);

  const items: PaletteItem[] = [
    ...data.spaces.map((s) => ({ g: 'Portfel', t: s.name, run: () => go('port') })),
    ...stasks.map((t) => ({ g: 'Vazifalar', t: t.title, sub: STATUSES[t.status].n, run: () => go('port') })),
  ];
  const sp = sprintOf(today);

  return (
    <SuiteShell section="pf" tabs={TABS} onTab={go} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead crumb="Persons Perforce · Portfel · Holat · Resurslar · Sifat · Ko‘rib chiqish" title="Persons" em="Perforce" pill={`Sprint ${sp.no} · ${fmtDay(sp.from)} – ${fmtDay(sp.to)}`} />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v); }} />
      </div>
      <section className="px-4 pb-10 sm:px-7">
        <div key={tab} className="sx-fade">
          {tab === 'port' && <Portfolio data={data} stasks={stasks} today={today} />}
          {tab === 'status' && <StatusBoard data={data} today={today} viewerId={viewerId} updates={data.statuses} />}
          {tab === 'res' && <ResourceLoad data={data} today={today} />}
          {tab === 'alm' && <Alm data={data} stasks={stasks} personById={personById} today={today} />}
          {tab === 'review' && <Review data={data} stasks={stasks} personById={personById} today={today} viewerId={viewerId} />}
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





/* ----------------------------------------------------------------- schedule */


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
      <RiskRegister risks={data.risks} spaces={data.spaces} people={data.people} personById={personById} today={today} />
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
                          onClick={async () => (await ask(`«${t.title}» o‘chirilsinmi?`)) && act(() => deleteTestCaseAction(t.id), 'Test o‘chirildi')}
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
function Review({ data, stasks, personById, today, viewerId }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; today: string; viewerId?: string }) {
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
      <ChangeRequests data={data} stasks={stasks} personById={personById} viewerId={viewerId} />
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
function ChangeRequests({ data, stasks, personById, viewerId }: { data: PfData; stasks: STask[]; personById: Map<string, StrategyPerson>; viewerId?: string }) {
  const { act, pending } = useAct();
  const [edit, setEdit] = useState<{ title: string; description: string; spaceId: string; staskId: string } | null>(null);
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
              {cr.status !== 'submitted' && (
                <button
                  className="sx-chipb"
                  aria-label="So‘rovni tahrirlash"
                  onClick={() => setEdit({ title: cr.title, description: cr.description ?? '', spaceId: cr.space_id ?? '', staskId: cr.stask_id ?? '' })}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              <button
                className="sx-chipb text-au-bad"
                aria-label="So‘rovni o‘chirish"
                disabled={pending}
                onClick={async () =>
                  (await ask(`«${cr.title}» so‘rovi (izoh va ovozlari bilan) o‘chirilsinmi?`)) &&
                  act(() => deleteChangeRequestAction(cr.id), 'So‘rov o‘chirildi', () => setSel(null))
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {edit && (
              <div className="mb-3 flex flex-col gap-2 rounded-xl border border-au-accent bg-au-card-2 p-3">
                <input className="sx-inp" maxLength={300} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                <textarea className="sx-inp !h-[80px] py-2" maxLength={5000} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
                <div className="flex flex-wrap gap-2">
                  <select className="sx-inp !h-[32px] flex-1" value={edit.spaceId} onChange={(e) => setEdit({ ...edit, spaceId: e.target.value, staskId: '' })}>
                    <option value="">Loyiha (ixtiyoriy)</option>
                    {data.spaces.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name}
                      </option>
                    ))}
                  </select>
                  <select className="sx-inp !h-[32px] flex-1" value={edit.staskId} onChange={(e) => setEdit({ ...edit, staskId: e.target.value })} disabled={!edit.spaceId}>
                    <option value="">Vazifa (ixtiyoriy)</option>
                    {stasks
                      .filter((t) => t.space_id === edit.spaceId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                  <button className="sx-btn sm" onClick={() => setEdit(null)}>
                    Bekor
                  </button>
                  <button
                    className="sx-btn primary sm"
                    disabled={pending || !edit.title.trim()}
                    onClick={() =>
                      act(
                        () =>
                          updateChangeRequestAction({
                            id: cr.id,
                            title: edit.title,
                            description: edit.description,
                            spaceId: edit.spaceId || null,
                            staskId: edit.staskId || null,
                          }),
                        'So‘rov saqlandi',
                        () => setEdit(null),
                      )
                    }
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            )}
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
                  <div className="group flex-1 rounded-lg bg-au-card-2 px-2.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <b className="flex-1 text-xs">{name(c.author_id)}</b>
                      {viewerId && c.author_id === viewerId && (
                        <button
                          className="text-au-faint opacity-0 transition group-hover:opacity-100 hover:text-au-bad"
                          aria-label="Izohni o‘chirish"
                          onClick={async () => (await ask('Izoh o‘chirilsinmi?')) && act(() => deleteCrCommentAction(c.id), 'Izoh o‘chirildi')}
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
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

