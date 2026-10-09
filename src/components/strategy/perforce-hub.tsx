'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Compass,
  FileDown,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  Pencil,
  Scale,
  ShieldAlert,
  ThumbsUp,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { budgetTotals, daysBetween, fmtDay, isLate, type StrategyPerson, type StrategySpace, type StrategyTask } from '@/lib/strategy';
import { riskScore } from '@/lib/perforce';
import { ROLE_DEPT, type Role } from '@/lib/permissions';
import {
  attention as buildAttention,
  DECISION_FLOW,
  DECISION_KIND_LABEL,
  DECISION_KINDS,
  DECISION_STATUS_LABEL,
  DEFAULT_WEIGHTS,
  level,
  loadMatrix,
  overloaded,
  RAG_META,
  suggest,
  weekStarts,
  type Attention,
  type DecisionKind,
  type DecisionStatus,
  type LoadItem,
  type LoadWeights,
  type Rag,
} from '@/lib/perforce-load';
import {
  applyDeadlineDecisionAction,
  commentChangeRequestAction,
  deleteChangeRequestAction,
  deleteCrCommentAction,
  deleteStatusUpdateAction,
  moveDecisionAction,
  saveDecisionAction,
  saveLoadWeightsAction,
  saveStatusUpdateAction,
  setSpaceOwnerAction,
  toggleDecisionSupportAction,
  updateStatusUpdateAction,
} from '@/lib/actions/perforce';
import { ask, SectionHead, SuiteShell, SuiteTabs, playSound, toast, type PaletteItem } from './suite-shell';
import { RiskRegister, type RiskRow } from './risk-register';
import { PersonAvatar } from './bits';
import './strategy.css';
import './suite.css';

/* ------------------------------------------------------------ data */

type STask = StrategyTask & { created_at: string; done_at: string | null };
export type Decision = {
  id: string;
  space_id: string | null;
  stask_id: string | null;
  kind: DecisionKind;
  title: string;
  description: string;
  current_value: string;
  proposed_value: string;
  impact: string;
  status: DecisionStatus;
  author_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
  created_at: string;
};
export type StatusUpdate = {
  id: string;
  space_id: string;
  rag: Rag;
  suggested: Rag | null;
  override_note: string | null;
  summary: string;
  next_steps: string;
  author_id: string | null;
  created_at: string;
  updated_at: string | null;
};
export type PfData = {
  spaces: { id: string; name: string; color: string; start_date: string; end_date: string; owner_id: string | null; budget: StrategySpace['budget'] }[];
  stasks: STask[];
  tasks: { id: string; title: string; status: string; assigned_to: string | null; deadline: string | null }[];
  issues: { id: string; title: string; status: string; assigned_to: string | null; created_at: string }[];
  people: StrategyPerson[];
  milestones: { id: string; space_id: string; title: string; date: string }[];
  risks: RiskRow[];
  statuses: StatusUpdate[];
  decisions: Decision[];
  comments: { id: string; cr_id: string; author_id: string | null; body: string; created_at: string }[];
  votes: { cr_id: string; voter_id: string }[];
  weights: LoadWeights;
  leave: { personId: string; from: string; to: string }[];
};

type Tab = 'overview' | 'status' | 'load' | 'risks' | 'decisions';
const TABS: { v: Tab; n: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { v: 'overview', n: 'Umumiy ko‘rinish', Icon: LayoutDashboard },
  { v: 'status', n: 'Haftalik holat', Icon: HeartPulse },
  { v: 'load', n: 'Jamoa yuklamasi', Icon: Users },
  { v: 'risks', n: 'Xavflar', Icon: ShieldAlert },
  { v: 'decisions', n: 'Qarorlar', Icon: Scale },
];
const PURPOSE: Record<Tab, string> = {
  overview: 'Har dushanba: qaysi loyiha xavfda va bugun nimaga e’tibor berish kerak.',
  status: 'Har juma: loyiha mas’uli 3 savolga javob beradi — nima qilindi, nima to‘sqinlik qilyapti, keyingi hafta nima.',
  load: 'Kim qancha band — ishni taqsimlashdan oldin qarang. Hisob kunlarda, haftalik me’yor bilan.',
  risks: 'Loyihaga nima xalaqit berishi mumkin va buning oldini olish uchun nima qilamiz.',
  decisions: 'Muddat, budjet, maqsad yoki odam o‘zgarishi — rahbariyat tasdiqlaydi, hammasi yozib qoladi.',
};
const KEY = 'persons-pf2-tab';
const INTRO = 'persons-pf2-intro';

const ERR: Record<string, string> = {
  forbidden: 'Ruxsat yo‘q',
  leadOnly: 'Qarorni faqat CEO yoki COO qabul qiladi',
  notOwner: 'Bu loyiha holatini faqat uning mas’uli yozadi',
  overrideNote: 'Tavsiyadan boshqa rang tanladingiz — sababini yozing',
  reasonRequired: 'Rad etish sababini yozing',
  locked: 'Yozuv 24 soatdan eski — o‘zgartirib bo‘lmaydi',
  conflict: 'Holat allaqachon o‘zgargan — sahifani yangilang',
  alreadyApplied: 'Allaqachon qo‘llangan',
  badDate: 'Taklif qilingan muddat YYYY-MM-DD ko‘rinishida bo‘lishi kerak',
  invalidInput: 'Ma’lumotni tekshiring',
};
const errText = (c: string) => ERR[c] ?? 'Saqlab bo‘lmadi';

const d10 = (s: string) => new Date(new Date(s).getTime() + 5 * 3_600_000).toISOString().slice(0, 10);
const fullName = (p?: StrategyPerson) => (p ? `${p.first_name} ${p.last_name}` : '—');
const mln = (n: number) => `${+n.toFixed(1)} mln`;

function useAct() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.error) return void toast.error(errText(r.error));
      if (ok) toast.success(ok);
      after?.();
      router.refresh();
    });
  return { act, pending };
}

/** Per-project numbers every tab shares (one definition, shown on screen). */
function projectHealth(data: PfData, s: PfData['spaces'][number], today: string) {
  const ts = data.stasks.filter((t) => t.space_id === s.id);
  const progress = ts.length ? ts.reduce((a, t) => a + (t.status === 'done' ? 100 : t.progress ?? 0), 0) / ts.length : 0;
  const span = Math.max(1, daysBetween(s.start_date, s.end_date));
  const elapsed = Math.min(100, Math.max(0, (daysBetween(s.start_date, today) / span) * 100));
  const late = ts.filter((t) => isLate(t, today));
  const risks = data.risks.filter((r) => r.space_id === s.id && r.status !== 'closed' && r.status !== 'occurred');
  const highRisks = risks.filter((r) => riskScore(r) >= 12).length;
  const sug = suggest({ progress, elapsed, behind: elapsed - progress, late: late.length, total: ts.length, highRisks });
  const statuses = data.statuses.filter((u) => u.space_id === s.id);
  const decisions = data.decisions.filter((d) => d.space_id === s.id && (d.status === 'review' || d.status === 'draft'));
  const b = budgetTotals(s.budget ?? []);
  return {
    s,
    ts,
    progress,
    elapsed,
    behind: elapsed - progress,
    late,
    risks,
    highRisks,
    suggestion: sug,
    last: statuses[0] ?? null,
    statuses,
    decisions,
    budget: b,
    daysLeft: daysBetween(today, s.end_date),
    active: today <= s.end_date,
  };
}
type PH = ReturnType<typeof projectHealth>;

/* ------------------------------------------------------------ shell */

export function PerforceHub({ data, today, viewerId, isLead, seesBudget }: { data: PfData; today: string; viewerId: string; isLead: boolean; seesBudget: boolean }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [focus, setFocus] = useState<string | null>(null);
  const [intro, setIntro] = useState(false);
  const [help, setHelp] = useState(false);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const v = localStorage.getItem(KEY) as Tab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of per-device preferences
      if (v && TABS.some((t) => t.v === v)) setTab(v);
      if (!localStorage.getItem(INTRO)) setIntro(true);
    } catch {}
  }, []);
  const go = (v: Tab, ref?: string) => {
    setTab(v);
    setFocus(ref ?? null);
    try {
      localStorage.setItem(KEY, v);
    } catch {}
  };
  const personById = useMemo(() => new Map(data.people.map((p) => [p.id, p])), [data.people]);
  const projects = useMemo(() => data.spaces.map((s) => projectHealth(data, s, today)), [data, today]);

  const items: PaletteItem[] = [
    ...TABS.map((t) => ({ g: 'Bo‘limlar', t: t.n, run: () => go(t.v) })),
    ...data.spaces.map((s) => ({ g: 'Loyihalar', t: s.name, run: () => go('status', s.id) })),
  ];
  const red = projects.filter((p) => p.active && (p.last?.rag ?? p.suggestion.rag) === 'red').length;

  return (
    <SuiteShell section="pf" tabs={TABS} onTab={(v) => go(v as Tab)} items={items}>
      <div className="px-4 sm:px-7">
        <SectionHead
          crumb="Persons Perforce · Loyihalar nazorati markazi"
          title="Persons"
          em="Perforce"
          pill={red ? `${red} loyiha xavfda` : 'Barcha loyihalar nazoratda'}
          pillTone={red ? 'bad' : 'ok'}
          right={
            <button className="sx-btn sm" onClick={() => setHelp(!help)}>
              <CircleHelp className="size-3.5" /> Qanday ishlaydi
            </button>
          }
        />
        <SuiteTabs tabs={TABS} value={tab} onChange={(v) => { playSound('nav'); go(v as Tab); }} />
        <p className="mt-2 mb-1 text-sm text-au-muted">{PURPOSE[tab]}</p>
      </div>
      <section className="px-4 pb-10 sm:px-7">
        {(intro || help) && <HowItWorks onClose={() => { setIntro(false); setHelp(false); try { localStorage.setItem(INTRO, '1'); } catch {} }} />}
        <div key={tab} className="sx-fade">
          {tab === 'overview' && <Overview data={data} projects={projects} today={today} personById={personById} seesBudget={seesBudget} go={go} />}
          {tab === 'status' && <StatusTab key={focus ?? 'none'} data={data} projects={projects} today={today} viewerId={viewerId} isLead={isLead} personById={personById} focus={focus} />}
          {tab === 'load' && <LoadTab data={data} today={today} isLead={isLead} />}
          {tab === 'risks' && <RiskRegister risks={data.risks} spaces={data.spaces} people={data.people} personById={personById} today={today} />}
          {tab === 'decisions' && <DecisionsTab data={data} viewerId={viewerId} isLead={isLead} personById={personById} focus={focus} />}
        </div>
      </section>
    </SuiteShell>
  );
}

function HowItWorks({ onClose }: { onClose: () => void }) {
  const steps = [
    { n: '1', t: 'Strategiya rejalaydi', d: 'Loyihalar, vazifalar va muddatlar Strategiya bo‘limida yaratiladi.' },
    { n: '2', t: 'Perforce nazorat qiladi', d: 'Bu yerda loyiha qanday ketayotgani, kim band, qanday xavf va qaysi qaror kutilayotgani ko‘rinadi.' },
    { n: '3', t: 'Har juma holat yoziladi', d: 'Loyiha mas’uli 2 daqiqada haftalik holatni yozadi. Dushanba rahbariyat “Umumiy ko‘rinish”ni ko‘radi.' },
  ];
  return (
    <div className="sx-card s12 mb-4" style={{ animation: 'sx-rise .4s both var(--sx-spring)' }}>
      <div className="sx-h">
        <h3 className="flex items-center gap-2">
          <Compass className="size-4" /> Perforce qanday ishlaydi
        </h3>
        <button className="sx-btn sm" onClick={onClose}>
          Tushundim
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="flex gap-3 rounded-xl border border-au-line p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-au-accent text-sm font-bold text-au-accent-ink">{s.n}</span>
            <div>
              <b className="text-sm">{s.t}</b>
              <p className="text-xs text-au-muted">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-au-muted sm:grid-cols-2">
        <p>
          <b className="text-au-ink">Haftalik tartib:</b> Dushanba — Umumiy ko‘rinish (5 daqiqa) · Hafta davomida — o‘zgarish bo‘lsa Qarorlar · Juma — Haftalik holat · Oyda bir —
          Xavflar va Jamoa yuklamasi.
        </p>
        <p>
          <b className="text-au-ink">Kim nima qiladi:</b> CEO/COO — ko‘radi va qaror qiladi · Loyiha mas’uli — holat, xavf va qaror so‘rovi yozadi · Operatsiya va IT — o‘z loyihalarini
          kuzatadi.
        </p>
      </div>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span className="cursor-help border-b border-dotted border-au-muted" title={text}>
      ?
    </span>
  );
}

function RagPill({ rag, small }: { rag: Rag; small?: boolean }) {
  return (
    <span className={cn('sx-pl', small && '!text-[10px]')} style={{ background: RAG_META[rag].soft, color: RAG_META[rag].c }}>
      {RAG_META[rag].n}
    </span>
  );
}

/* ------------------------------------------------------------ 1. overview */

function Overview({
  data,
  projects,
  today,
  personById,
  seesBudget,
  go,
}: {
  data: PfData;
  projects: PH[];
  today: string;
  personById: Map<string, StrategyPerson>;
  seesBudget: boolean;
  go: (t: Tab, ref?: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const weeks = useMemo(() => weekStarts(today, 2), [today]);
  const load = useMemo(() => loadMatrix(data, data.people.map((p) => p.id), weeks, data.weights, data.leave), [data, weeks]);
  const att: Attention[] = buildAttention({
    today,
    projects: projects.map((p) => ({ id: p.s.id, name: p.s.name, rag: p.last?.rag ?? p.suggestion.rag, lastStatusDay: p.last ? d10(p.last.created_at) : null, active: p.active })),
    decisions: data.decisions.map((d) => ({ id: d.id, title: d.title, status: d.status, created_at: d10(d.created_at) })),
    overloaded: overloaded(load, data.weights.capacity).map((o) => ({ name: fullName(personById.get(o.id)), days: o.days, week: o.week })),
    milestones: data.milestones.map((m) => ({ ...m, project: data.spaces.find((s) => s.id === m.space_id)?.name ?? '' })),
    risks: data.risks.map((r) => ({ id: r.id, title: r.title, score: riskScore(r), status: r.status, review_date: r.review_date })),
  });
  const active = projects.filter((p) => p.active);
  const cnt = (r: Rag) => active.filter((p) => (p.last?.rag ?? p.suggestion.rag) === r).length;
  const openDecisions = data.decisions.filter((d) => d.status === 'review').length;
  const openHigh = data.risks.filter((r) => r.status !== 'closed' && r.status !== 'occurred' && riskScore(r) >= 12).length;
  const sel = projects.find((p) => p.s.id === open);

  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="sx-h">
          <h3 className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> Bugun e’tibor kerak
          </h3>
          <small>{att.length ? `${att.length} ta band` : ''}</small>
        </div>
        {att.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-sm text-au-ok">
            <CheckCircle2 className="size-4" /> Barcha loyihalar rejada ✓
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-au-line">
            {att.slice(0, 12).map((a, i) => (
              <li key={a.key} className="flex items-center gap-3 py-2" style={{ animation: 'sx-rise .35s both', animationDelay: `${i * 30}ms` }}>
                <i className="size-2.5 shrink-0 rounded-full" style={{ background: a.level === 'red' ? 'var(--au-bad)' : '#e08a00' }} />
                <span className="flex-1 text-sm">{a.text}</span>
                <button className="sx-btn sm" onClick={() => go(a.tab, a.ref)}>
                  Ochish <ArrowRight className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {[
        { l: 'Faol loyihalar', v: String(active.length), d: `${projects.length - active.length} ta yakunlangan` },
        { l: 'Yaxshi · Diqqat · Xavf', v: `${cnt('green')} · ${cnt('amber')} · ${cnt('red')}`, d: 'oxirgi holat yoki tizim tavsiyasi' },
        { l: 'Qaror kutmoqda', v: String(openDecisions), d: 'Qarorlar bo‘limida' },
        { l: 'Yuqori xavflar', v: String(openHigh), d: 'ball 12 va undan yuqori' },
      ].map((k, i) => (
        <div key={k.l} className={cn('sx-card sx-stat s3', i === 0 && 'dark')}>
          <div className="l">{k.l}</div>
          <div className="v">{k.v}</div>
          <div className="d">{k.d}</div>
        </div>
      ))}

      {projects.length === 0 && (
        <div className="sx-card s12 sx-empty">
          Hali loyiha yo‘q — loyihalar <Link className="font-semibold text-au-accent-text underline" href="/strategy">Strategiya</Link> bo‘limida yaratiladi.
        </div>
      )}
      {projects.map((p, i) => {
        const rag = p.last?.rag ?? p.suggestion.rag;
        const owner = p.s.owner_id ? personById.get(p.s.owner_id) : undefined;
        return (
          <button
            key={p.s.id}
            onClick={() => setOpen(open === p.s.id ? null : p.s.id)}
            className={cn('sx-card s4 text-left transition hover:-translate-y-0.5', open === p.s.id && 'ring-2 ring-au-accent', !p.active && 'opacity-60')}
            style={{ animation: 'sx-rise .45s both var(--sx-spring)', animationDelay: `${i * 40}ms`, borderTop: `3px solid ${RAG_META[rag].c}` }}
          >
            <div className="flex items-center justify-between gap-2">
              <b className="flex min-w-0 items-center gap-2">
                <i className="size-2.5 shrink-0 rounded" style={{ background: p.s.color }} />
                <span className="truncate">{p.s.name}</span>
              </b>
              <RagPill rag={rag} />
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-au-muted">
              <PersonAvatar person={owner} size={18} /> {owner ? fullName(owner) : 'Mas’ul belgilanmagan'} · {p.active ? `${p.daysLeft} kun qoldi` : 'yakunlangan'}
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs">
                <span>
                  Bajarildi <b>{Math.round(p.progress)}%</b> · vaqt o‘tdi <b>{Math.round(p.elapsed)}%</b>
                </span>
                {p.behind > 5 && <span className="font-semibold text-au-bad">{Math.round(p.behind)} punkt orqada</span>}
              </div>
              <div className="relative mt-1 h-2.5 overflow-hidden rounded bg-au-card-2">
                <i className="absolute inset-y-0 left-0 rounded bg-[#139a52]" style={{ width: `${p.progress}%` }} />
                <i className="absolute inset-y-0 w-0.5 bg-au-ink" style={{ left: `${p.elapsed}%` }} title="Bugun" />
              </div>
            </div>
            {seesBudget && p.budget.plan > 0 && (
              <div className="mt-2 text-xs">
                Budjet: reja <b>{mln(p.budget.plan)}</b> · sarflandi <b>{mln(p.budget.act)}</b> ({Math.round(p.budget.used * 100)}%)
                {p.progress > 0 && p.budget.used > 0 && (
                  <span className="block text-au-muted">
                    Har 1 so‘m reja ishiga {(p.budget.used * 100 / p.progress).toFixed(1)} so‘m sarflanmoqda{' '}
                    <Hint text="Sarflangan budjet ulushi ÷ bajarilish ulushi. 1 dan kichik — tejamkor, 1 dan katta — rejadan qimmat." />
                  </span>
                )}
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              <span className={cn('sx-pl', p.late.length && 'bad')}>{p.late.length} kechikkan</span>
              <span className={cn('sx-pl', p.highRisks && 'warn')}>{p.risks.length} xavf</span>
              <span className={cn('sx-pl', p.decisions.length && 'warn')}>{p.decisions.length} qaror</span>
              <span className="sx-pl">{p.last ? `holat: ${fmtDay(d10(p.last.created_at))}` : 'holat yo‘q'}</span>
            </div>
          </button>
        );
      })}

      {sel && <ProjectPanel p={sel} data={data} personById={personById} go={go} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProjectPanel({ p, data, personById, go, onClose }: { p: PH; data: PfData; personById: Map<string, StrategyPerson>; go: (t: Tab, ref?: string) => void; onClose: () => void }) {
  const ms = data.milestones.filter((m) => m.space_id === p.s.id).slice(0, 6);
  return (
    <div className="sx-card s12" style={{ animation: 'sx-rise .35s both' }}>
      <div className="sx-h">
        <h3 className="flex items-center gap-2">
          <i className="size-2.5 rounded" style={{ background: p.s.color }} /> {p.s.name}
        </h3>
        <button onClick={onClose} className="text-au-muted hover:text-au-ink" aria-label="Yopish">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <b className="text-xs text-au-muted uppercase">Holat tarixi</b>
          <div className="mt-2 flex gap-1">
            {[...p.statuses].slice(0, 12).reverse().map((u) => (
              <i key={u.id} className="h-5 flex-1 rounded-sm" style={{ background: RAG_META[u.rag].c }} title={`${d10(u.created_at)} · ${RAG_META[u.rag].n}`} />
            ))}
            {p.statuses.length === 0 && <span className="text-xs text-au-muted">yozilmagan</span>}
          </div>
          {p.last && <p className="mt-2 line-clamp-4 text-sm">{p.last.summary}</p>}
          <button className="sx-btn sm mt-2" onClick={() => go('status', p.s.id)}>
            Haftalik holat <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div>
          <b className="text-xs text-au-muted uppercase">Xavflar</b>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {p.risks.slice(0, 5).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className={cn('sx-pl', riskScore(r) >= 12 && 'bad')}>{riskScore(r)}</span>
              </li>
            ))}
            {!p.risks.length && <li className="text-au-muted">yo‘q</li>}
          </ul>
          <button className="sx-btn sm mt-2" onClick={() => go('risks')}>
            Xavflar <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div>
          <b className="text-xs text-au-muted uppercase">Milestone’lar va qarorlar</b>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {ms.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">{m.title}</span>
                <span className="text-au-muted tabular-nums">{fmtDay(m.date)}</span>
              </li>
            ))}
            {p.decisions.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate">⚖ {d.title}</span>
                <span className="sx-pl warn">{DECISION_STATUS_LABEL[d.status]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-au-muted">Mas’ul: {fullName(p.s.owner_id ? personById.get(p.s.owner_id) : undefined)}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ 2. weekly status */

function StatusTab({
  data,
  projects,
  today,
  viewerId,
  isLead,
  personById,
  focus,
}: {
  data: PfData;
  projects: PH[];
  today: string;
  viewerId: string;
  isLead: boolean;
  personById: Map<string, StrategyPerson>;
  focus: string | null;
}) {
  const { act, pending } = useAct();
  const [space, setSpace] = useState(focus ?? projects[0]?.s.id ?? '');
  const [form, setForm] = useState<{ rag: Rag; done: string; blockers: string; next: string; note: string } | null>(null);
  const [edit, setEdit] = useState<{ id: string; summary: string; next: string } | null>(null);
  // Captured once per mount (render must stay pure); the server enforces the 24 h window.
  const [nowMs] = useState(() => Date.now());
  if (!projects.length) return <div className="sx-card s12 sx-empty">Strategiyada loyiha yo‘q</div>;
  const p = projects.find((x) => x.s.id === space) ?? projects[0];
  const canWrite = !p.s.owner_id || p.s.owner_id === viewerId || isLead;
  const sug = p.suggestion;

  return (
    <div className="sx-grid">
      <div className="sx-card s12">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {projects.map((x) => {
            const age = x.last ? daysBetween(d10(x.last.created_at), today) : null;
            return (
              <button
                key={x.s.id}
                onClick={() => {
                  setSpace(x.s.id);
                  setForm(null);
                }}
                className={cn('flex flex-col gap-1 rounded-xl border p-3 text-left transition hover:bg-au-card-2', p.s.id === x.s.id ? 'border-au-accent' : 'border-au-line')}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <i className="size-2.5 rounded" style={{ background: x.s.color }} />
                  <span className="truncate">{x.s.name}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {x.last ? <RagPill rag={x.last.rag} small /> : <span className="sx-pl">yozilmagan</span>}
                  {age !== null && <span className={age > 7 ? 'text-au-bad' : 'text-au-muted'}>{age === 0 ? 'bugun' : `${age} kun oldin`}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sx-card s8">
        <div className="sx-h">
          <h3 className="flex items-center gap-2">
            <i className="size-2.5 rounded" style={{ background: p.s.color }} /> {p.s.name}
          </h3>
          <div className="flex gap-1.5">
            <button className="sx-btn sm" onClick={() => exportStatusPdf(p, data, personById)}>
              <FileDown className="size-3.5" /> PDF
            </button>
            {canWrite && !form && (
              <button className="sx-btn primary sm" onClick={() => setForm({ rag: sug.rag, done: '', blockers: '', next: '', note: '' })}>
                Haftalik holatni yozish
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-au-muted">Tizim tavsiyasi:</span> <RagPill rag={sug.rag} /> <span className="text-xs text-au-muted">— {sug.reasons.join(', ')}</span>
          <Hint text="Xavf: kechikkan vazifalar 20% dan ko‘p, yoki 25 punktdan ortiq orqada, yoki 2+ yuqori xavf. Diqqat: 1+ kechikkan vazifa, yoki 10 punktdan ortiq orqada, yoki 1 yuqori xavf." />
        </div>
        <div className="mt-2 text-xs text-au-muted">
          Mas’ul: <b className="text-au-ink">{fullName(p.s.owner_id ? personById.get(p.s.owner_id) : undefined)}</b>
          {isLead && <OwnerPicker spaceId={p.s.id} ownerId={p.s.owner_id} people={data.people} />}
        </div>

        {form && (
          <div className="mt-3 flex flex-col gap-2 rounded-xl border border-au-line bg-au-card-2 p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['green', 'amber', 'red'] as Rag[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setForm({ ...form, rag: r })}
                  className="sx-btn sm"
                  style={form.rag === r ? { background: RAG_META[r].c, borderColor: RAG_META[r].c, color: '#fff' } : undefined}
                >
                  {RAG_META[r].n}
                </button>
              ))}
            </div>
            {form.rag !== sug.rag && (
              <input className="sx-inp !h-[32px]" placeholder={`Nega “${RAG_META[form.rag].n}”? (tavsiya: ${RAG_META[sug.rag].n})`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            )}
            <label className="text-xs font-semibold text-au-muted">1. Bu hafta nima qilindi?</label>
            <textarea className="sx-inp !h-auto py-2" rows={3} value={form.done} onChange={(e) => setForm({ ...form, done: e.target.value })} />
            <label className="text-xs font-semibold text-au-muted">2. Nima to‘sqinlik qilyapti, qanday yordam kerak?</label>
            <textarea className="sx-inp !h-auto py-2" rows={2} value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} />
            <label className="text-xs font-semibold text-au-muted">3. Keyingi hafta nima qilinadi?</label>
            <textarea className="sx-inp !h-auto py-2" rows={2} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button className="sx-btn sm" onClick={() => setForm(null)}>
                Bekor
              </button>
              <button
                className="sx-btn primary sm"
                disabled={pending || !form.done.trim() || (form.rag !== sug.rag && form.note.trim().length < 3)}
                onClick={() =>
                  act(
                    () =>
                      saveStatusUpdateAction({
                        spaceId: p.s.id,
                        rag: form.rag,
                        suggested: sug.rag,
                        overrideNote: form.note,
                        summary: form.blockers.trim() ? `${form.done.trim()}\n\nTo‘siq: ${form.blockers.trim()}` : form.done.trim(),
                        nextSteps: form.next,
                      }),
                    'Haftalik holat yozildi',
                    () => setForm(null),
                  )
                }
              >
                Saqlash
              </button>
            </div>
          </div>
        )}

        <div className="mt-4">
          <b className="text-xs text-au-muted uppercase">12 hafta</b>
          <div className="mt-1 flex gap-1">
            {[...p.statuses].slice(0, 12).reverse().map((u) => (
              <i key={u.id} className="h-4 flex-1 rounded-sm" style={{ background: RAG_META[u.rag].c }} title={`${d10(u.created_at)} · ${RAG_META[u.rag].n}`} />
            ))}
            {Array.from({ length: Math.max(0, 12 - p.statuses.length) }).map((_, i) => (
              <i key={`e${i}`} className="h-4 flex-1 rounded-sm bg-au-card-2" />
            ))}
          </div>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          {p.statuses.length === 0 && <li className="sx-empty">Hali holat yozilmagan — birinchisini yozing (2 daqiqa).</li>}
          {p.statuses.map((u) => {
            const fresh = nowMs - Date.parse(u.created_at) < 86_400_000;
            const mine = u.author_id === viewerId && fresh;
            return (
              <li key={u.id} className="flex gap-3 border-l-[3px] pl-3" style={{ borderColor: RAG_META[u.rag].c }}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] text-au-muted">
                    <b style={{ color: RAG_META[u.rag].c }}>{RAG_META[u.rag].n}</b> · {fullName(u.author_id ? personById.get(u.author_id) : undefined)} · {fmtDay(d10(u.created_at))}
                    {u.updated_at && ' · tahrirlangan'}
                  </span>
                  {u.override_note && (
                    <span className="text-[11px] text-au-muted">
                      Tavsiya {u.suggested ? RAG_META[u.suggested].n : '—'} edi — sabab: {u.override_note}
                    </span>
                  )}
                  {edit?.id === u.id ? (
                    <div className="flex flex-col gap-1.5">
                      <textarea className="sx-inp !h-auto py-2" rows={3} value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} />
                      <textarea className="sx-inp !h-auto py-2" rows={2} value={edit.next} onChange={(e) => setEdit({ ...edit, next: e.target.value })} />
                      <div className="flex justify-end gap-1.5">
                        <button className="sx-btn sm" onClick={() => setEdit(null)}>
                          Bekor
                        </button>
                        <button className="sx-btn primary sm" disabled={pending} onClick={() => act(() => updateStatusUpdateAction({ id: u.id, summary: edit.summary, nextSteps: edit.next }), 'Saqlandi', () => setEdit(null))}>
                          Saqlash
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap">{u.summary}</p>
                      {u.next_steps && (
                        <p className="text-xs text-au-muted">
                          <b>Keyingi hafta:</b> {u.next_steps}
                        </p>
                      )}
                    </>
                  )}
                </div>
                {mine && edit?.id !== u.id && (
                  <span className="flex shrink-0 flex-col gap-1">
                    <button className="text-au-muted hover:text-au-ink" title="24 soat ichida tahrirlash mumkin" onClick={() => setEdit({ id: u.id, summary: u.summary, next: u.next_steps })}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="text-au-muted hover:text-au-bad"
                      onClick={async () => {
                        if (await ask('Bu holat yozuvini o‘chirasizmi?')) act(() => deleteStatusUpdateAction(u.id), 'O‘chirildi');
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="sx-card s4">
        <div className="sx-h">
          <h3>Raqamlar</h3>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-au-muted">Bajarildi / vaqt o‘tdi</dt>
            <dd className="font-semibold tabular-nums">
              {Math.round(p.progress)}% / {Math.round(p.elapsed)}%
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-au-muted">Kechikkan vazifalar</dt>
            <dd className="font-semibold tabular-nums">
              {p.late.length} / {p.ts.length}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-au-muted">Yuqori xavflar</dt>
            <dd className="font-semibold tabular-nums">{p.highRisks}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-au-muted">Muddat</dt>
            <dd className="font-semibold">{fmtDay(p.s.end_date)}</dd>
          </div>
        </dl>
        <div className="sx-h mt-4">
          <h3>Kechikkan vazifalar</h3>
        </div>
        {p.late.length === 0 ? (
          <div className="sx-empty">Yo‘q ✓</div>
        ) : (
          <ul className="flex flex-col gap-1.5 text-sm">
            {p.late.slice(0, 8).map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-au-bad tabular-nums">{fmtDay(t.end_date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OwnerPicker({ spaceId, ownerId, people }: { spaceId: string; ownerId: string | null; people: StrategyPerson[] }) {
  const { act, pending } = useAct();
  return (
    <select className="sx-inp ml-2 !inline-block !h-[26px] !w-auto !py-0 text-xs" disabled={pending} value={ownerId ?? ''} onChange={(e) => act(() => setSpaceOwnerAction(spaceId, e.target.value || null), 'Mas’ul belgilandi')}>
      <option value="">— mas’ulni tanlang —</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.first_name} {p.last_name}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------ 3. workload */

const LVL = {
  free: 'bg-au-card-2 text-au-muted',
  ok: 'bg-[color-mix(in_oklab,var(--au-ok)_26%,transparent)]',
  busy: 'bg-[color-mix(in_oklab,#ff9f1c_38%,transparent)]',
  over: 'bg-[color-mix(in_oklab,var(--au-bad)_60%,transparent)] text-white',
} as const;
const DEPT_N: Record<string, string> = { top: 'Rahbariyat', acad: 'Akademik', com: 'Tijorat', ops: 'Operatsiya', fin: 'Moliya', hr: 'HR' };
const KIND_N: Record<LoadItem['kind'], string> = { stask: 'Loyiha vazifasi', task: 'Vazifa', issue: 'Muammo' };

function LoadTab({ data, today, isLead }: { data: PfData; today: string; isLead: boolean }) {
  const { act, pending } = useAct();
  const weeks = useMemo(() => weekStarts(today, 8), [today]);
  const [dept, setDept] = useState('');
  const [open, setOpen] = useState<{ id: string; w: number } | null>(null);
  const [wEdit, setWEdit] = useState<LoadWeights | null>(null);
  const W = data.weights;
  const m = useMemo(() => loadMatrix(data, data.people.map((p) => p.id), weeks, W, data.leave), [data, weeks, W]);
  const people = data.people.filter((p) => !dept || ROLE_DEPT[p.role as Role] === dept);
  const rows = people
    .map((p) => ({ p, row: m.get(p.id)! }))
    .filter((r) => r.row.some((w) => w.days > 0 || w.leave))
    .sort((a, b) => b.row[0].days - a.row[0].days);
  const over = overloaded(m, W.capacity).filter((o) => people.some((p) => p.id === o.id));
  const free = people.filter((p) => (m.get(p.id)?.[0].days ?? 0) === 0 && !m.get(p.id)?.[0].leave);
  const sel = open ? m.get(open.id)?.[open.w] : null;
  const selP = open ? data.people.find((p) => p.id === open.id) : null;

  return (
    <div className="sx-grid">
      <div className="sx-card sx-stat dark s3">
        <div className="l">Me’yordan ortiq band</div>
        <div className="v" style={{ color: over.length ? '#ff8a8a' : undefined }}>{over.length}</div>
        <div className="d">shu yoki keyingi hafta</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Bo‘sh (shu hafta)</div>
        <div className="v">{free.length}</div>
        <div className="d truncate">{free.slice(0, 3).map((p) => p.first_name).join(', ') || '—'} — yangi ish berish mumkin</div>
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Hisob qoidasi</div>
        <div className="text-xs leading-5">
          Loyiha vazifasi ≈ <b>{W.stask}</b> kun/hafta · vazifa ≈ <b>{W.task}</b> kun · muammo ≈ <b>{W.issue}</b> kun · me’yor <b>{W.capacity}</b> kun
        </div>
        {isLead && !wEdit && (
          <button className="sx-btn sm mt-1" onClick={() => setWEdit(W)}>
            O‘zgartirish
          </button>
        )}
      </div>
      <div className="sx-card sx-stat s3">
        <div className="l">Bo‘lim</div>
        <select className="sx-inp mt-1 !h-[32px]" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">Hammasi</option>
          {Object.entries(DEPT_N).map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {wEdit && (
        <div className="sx-card s12">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ['stask', 'Loyiha vazifasi (kun/hafta)'],
                ['task', 'Vazifa (kun)'],
                ['issue', 'Muammo (kun)'],
                ['capacity', 'Haftalik me’yor (kun)'],
              ] as [keyof LoadWeights, string][]
            ).map(([k, n]) => (
              <label key={k} className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
                {n}
                <input className="sx-inp !h-[32px]" type="number" step="0.5" min="0" value={wEdit[k]} onChange={(e) => setWEdit({ ...wEdit, [k]: Number(e.target.value) })} />
              </label>
            ))}
            <div className="flex items-end gap-1.5">
              <button className="sx-btn sm" onClick={() => setWEdit(DEFAULT_WEIGHTS)}>
                Standart
              </button>
              <button className="sx-btn primary sm" disabled={pending} onClick={() => act(() => saveLoadWeightsAction(wEdit), 'Saqlandi', () => setWEdit(null))}>
                Saqlash
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={cn('sx-card', sel ? 's8' : 's12')}>
        <div className="sx-h">
          <h3 className="flex items-center gap-2">
            <Gauge className="size-4" /> 8 hafta, kunlarda
          </h3>
          <small>yashil ≤70% · sariq ≤100% · qizil — me’yordan ortiq · kulrang — ta’til</small>
        </div>
        {rows.length === 0 ? (
          <div className="sx-empty">Hech kimda ochiq ish yo‘q</div>
        ) : (
          <div className="sx-tw">
            <table className="sx-tbl">
              <thead>
                <tr>
                  <th className="l">Xodim</th>
                  {weeks.map((w, i) => (
                    <th key={w}>{i === 0 ? 'Shu hafta' : fmtDay(w)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, row }, ri) => (
                  <tr key={p.id} style={{ animationDelay: `${Math.min(ri, 15) * 25}ms` }}>
                    <td className="l">
                      <span className="flex items-center gap-2">
                        <PersonAvatar person={p} size={22} />
                        <span className="truncate">
                          {p.first_name} {p.last_name}
                        </span>
                      </span>
                    </td>
                    {row.map((w, i) => (
                      <td key={i} className="!p-1">
                        <button
                          onClick={() => setOpen(open?.id === p.id && open.w === i ? null : { id: p.id, w: i })}
                          className={cn(
                            'h-8 w-full min-w-12 rounded-md text-xs font-bold tabular-nums transition hover:ring-2 hover:ring-au-accent',
                            w.leave ? 'bg-au-line text-au-muted' : LVL[level(w.days, W.capacity)],
                            open?.id === p.id && open.w === i && 'ring-2 ring-au-ink',
                          )}
                        >
                          {w.leave ? 'Ta’til' : w.days ? `${w.days}/${W.capacity}` : ''}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {sel && selP && (
        <div className="sx-card s4">
          <div className="sx-h">
            <h3>
              {selP.first_name} · {open!.w === 0 ? 'shu hafta' : fmtDay(weeks[open!.w])}
            </h3>
            <small>
              {sel.days} / {W.capacity} kun
            </small>
          </div>
          <ul className="flex flex-col gap-1.5 text-sm">
            {sel.items.map((it) => (
              <li key={it.kind + it.id} className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate">{it.title}</span>
                <span className="sx-pl shrink-0">
                  {KIND_N[it.kind]} · {it.days}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/tasks" className="sx-btn sm mt-3">
            Vazifalarini ko‘rish <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ 5. decisions */

type DForm = { id?: string; kind: DecisionKind; title: string; currentValue: string; proposedValue: string; description: string; impact: string; spaceId: string; staskId: string };
const EMPTY_D: DForm = { kind: 'deadline', title: '', currentValue: '', proposedValue: '', description: '', impact: '', spaceId: '', staskId: '' };
const STATUS_TONE: Record<DecisionStatus, string> = { draft: '', review: 'warn', approved: 'ok', rejected: 'bad' };

function DecisionsTab({ data, viewerId, isLead, personById, focus }: { data: PfData; viewerId: string; isLead: boolean; personById: Map<string, StrategyPerson>; focus: string | null }) {
  const { act, pending } = useAct();
  const [filter, setFilter] = useState<'open' | 'all' | 'mine'>('open');
  const [sel, setSel] = useState<string | null>(focus);
  const [form, setForm] = useState<DForm | null>(null);
  const [note, setNote] = useState('');
  const [cm, setCm] = useState('');
  const list = data.decisions.filter((d) => (filter === 'open' ? d.status === 'review' || d.status === 'draft' : filter === 'mine' ? d.author_id === viewerId : true));
  const d = data.decisions.find((x) => x.id === sel) ?? null;
  const space = (id: string | null) => data.spaces.find((s) => s.id === id);
  const votes = (id: string) => data.votes.filter((v) => v.cr_id === id);

  const save = (submit: boolean) =>
    form &&
    act(
      () => saveDecisionAction({ ...form, spaceId: form.spaceId || null, staskId: form.staskId || null, submit }),
      submit ? 'So‘rov rahbariyatga yuborildi' : 'Qoralama saqlandi',
      () => setForm(null),
    );

  return (
    <div className="sx-grid">
      <div className="sx-card s5">
        <div className="sx-h">
          <h3>Qarorlar</h3>
          <button className="sx-btn primary sm" onClick={() => { setForm({ ...EMPTY_D }); setSel(null); }}>
            + So‘rov
          </button>
        </div>
        <div className="mb-2 flex gap-1">
          {(
            [
              ['open', 'Ochiq'],
              ['mine', 'Meniki'],
              ['all', 'Hammasi (jurnal)'],
            ] as const
          ).map(([k, n]) => (
            <button key={k} className={cn('sx-chipb', filter === k && 'on')} onClick={() => setFilter(k)}>
              {n}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="sx-empty">{filter === 'open' ? 'Kutilayotgan qaror yo‘q ✓' : 'Hali so‘rov yo‘q'}</div>
        ) : (
          <ul className="flex flex-col divide-y divide-au-line">
            {list.map((x) => (
              <li key={x.id}>
                <button onClick={() => { setSel(x.id); setForm(null); }} className={cn('flex w-full flex-col gap-1 py-2 text-left', sel === x.id && 'text-au-accent-text')}>
                  <span className="flex items-center justify-between gap-2">
                    <b className="truncate text-sm">{x.title}</b>
                    <span className={cn('sx-pl shrink-0', STATUS_TONE[x.status])}>{DECISION_STATUS_LABEL[x.status]}</span>
                  </span>
                  <span className="text-[11px] text-au-muted">
                    {DECISION_KIND_LABEL[x.kind]} · {space(x.space_id)?.name ?? 'umumiy'} · {fullName(x.author_id ? personById.get(x.author_id) : undefined)} · {fmtDay(d10(x.created_at))}
                    {votes(x.id).length > 0 && ` · 👍 ${votes(x.id).length}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sx-card s7">
        {form ? (
          <div className="flex flex-col gap-2">
            <div className="sx-h">
              <h3>{form.id ? 'So‘rovni tahrirlash' : 'Yangi qaror so‘rovi'}</h3>
            </div>
            <div className="flex flex-wrap gap-1">
              {DECISION_KINDS.map((k) => (
                <button key={k} className={cn('sx-chipb', form.kind === k && 'on')} onClick={() => setForm({ ...form, kind: k })}>
                  {DECISION_KIND_LABEL[k]}
                </button>
              ))}
            </div>
            <input className="sx-inp" placeholder="Nima o‘zgaradi? (masalan: IELTS kursi ochilishini 2 haftaga surish)" maxLength={300} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="sx-inp"
                placeholder={form.kind === 'deadline' ? 'Hozirgi muddat (YYYY-MM-DD)' : 'Hozirgi holat'}
                value={form.currentValue}
                onChange={(e) => setForm({ ...form, currentValue: e.target.value })}
              />
              <input
                className="sx-inp"
                placeholder={form.kind === 'deadline' ? 'Taklif: yangi muddat (YYYY-MM-DD)' : 'Taklif'}
                value={form.proposedValue}
                onChange={(e) => setForm({ ...form, proposedValue: e.target.value })}
              />
            </div>
            <textarea className="sx-inp !h-auto py-2" rows={3} placeholder="Sabab — nega kerak?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <textarea className="sx-inp !h-auto py-2" rows={2} placeholder="Ta’siri — nimaga ta’sir qiladi (odamlar, budjet, boshqa loyihalar)?" value={form.impact} onChange={(e) => setForm({ ...form, impact: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <select className="sx-inp" value={form.spaceId} onChange={(e) => setForm({ ...form, spaceId: e.target.value, staskId: '' })}>
                <option value="">Loyiha (ixtiyoriy)</option>
                {data.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select className="sx-inp" value={form.staskId} onChange={(e) => setForm({ ...form, staskId: e.target.value })}>
                <option value="">Vazifa (ixtiyoriy)</option>
                {data.stasks
                  .filter((t) => !form.spaceId || t.space_id === form.spaceId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button className="sx-btn sm" onClick={() => setForm(null)}>
                Bekor
              </button>
              <button className="sx-btn sm" disabled={pending || !form.title.trim()} onClick={() => save(false)}>
                Qoralama
              </button>
              <button className="sx-btn primary sm" disabled={pending || !form.title.trim() || !form.description.trim()} onClick={() => save(true)}>
                Rahbariyatga yuborish
              </button>
            </div>
          </div>
        ) : !d ? (
          <div className="sx-empty">Chapdan so‘rovni tanlang yoki yangisini yarating.</div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="sx-h">
              <h3>{d.title}</h3>
              <span className={cn('sx-pl', STATUS_TONE[d.status])}>{DECISION_STATUS_LABEL[d.status]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              <span className="sx-pl">{DECISION_KIND_LABEL[d.kind]}</span>
              {space(d.space_id) && <span className="sx-pl">{space(d.space_id)!.name}</span>}
              <span className="text-au-muted">
                {fullName(d.author_id ? personById.get(d.author_id) : undefined)} · {fmtDay(d10(d.created_at))}
              </span>
            </div>
            {(d.current_value || d.proposed_value) && (
              <div className="flex items-center gap-2 rounded-xl bg-au-card-2 p-3 text-sm">
                <span className="text-au-muted line-through">{d.current_value || '—'}</span>
                <ArrowRight className="size-4 text-au-muted" />
                <b>{d.proposed_value || '—'}</b>
              </div>
            )}
            {d.description && (
              <p className="text-sm whitespace-pre-wrap">
                <b className="text-xs text-au-muted uppercase">Sabab: </b>
                {d.description}
              </p>
            )}
            {d.impact && (
              <p className="text-sm whitespace-pre-wrap">
                <b className="text-xs text-au-muted uppercase">Ta’siri: </b>
                {d.impact}
              </p>
            )}
            {d.decided_at && (
              <p className="rounded-xl border border-au-line p-2 text-sm">
                <b>{DECISION_STATUS_LABEL[d.status]}</b> · {fullName(d.decided_by ? personById.get(d.decided_by) : undefined)} · {fmtDay(d10(d.decided_at))}
                {d.decision_note && <span className="block text-au-muted">{d.decision_note}</span>}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                className={cn('sx-btn sm', votes(d.id).some((v) => v.voter_id === viewerId) && 'primary')}
                disabled={pending}
                onClick={() => act(() => toggleDecisionSupportAction(d.id))}
              >
                <ThumbsUp className="size-3.5" /> Qo‘llab-quvvatlayman · {votes(d.id).length}
              </button>
              {d.status === 'draft' && d.author_id === viewerId && (
                <>
                  <button className="sx-btn sm" onClick={() => setForm({ id: d.id, kind: d.kind, title: d.title, currentValue: d.current_value, proposedValue: d.proposed_value, description: d.description, impact: d.impact, spaceId: d.space_id ?? '', staskId: d.stask_id ?? '' })}>
                    <Pencil className="size-3.5" /> Tahrirlash
                  </button>
                  <button className="sx-btn primary sm" disabled={pending} onClick={() => act(() => moveDecisionAction({ id: d.id, to: 'review' }), 'Rahbariyatga yuborildi')}>
                    Yuborish
                  </button>
                </>
              )}
              {d.status === 'review' && d.author_id === viewerId && (
                <button className="sx-btn sm" disabled={pending} onClick={() => act(() => moveDecisionAction({ id: d.id, to: 'draft' }), 'Qoralamaga qaytarildi')}>
                  Qaytarib olish
                </button>
              )}
              {d.status === 'approved' && d.kind === 'deadline' && d.space_id && !d.applied_at && isLead && (
                <button className="sx-btn primary sm" disabled={pending} onClick={() => act(() => applyDeadlineDecisionAction(d.id), 'Loyiha muddati yangilandi')}>
                  Loyiha muddatini yangilash
                </button>
              )}
              {d.applied_at && <span className="sx-pl ok">Qo‘llangan · {fmtDay(d10(d.applied_at))}</span>}
              {(d.author_id === viewerId || isLead) && d.status !== 'approved' && (
                <button
                  className="sx-btn sm text-au-bad"
                  disabled={pending}
                  onClick={async () => {
                    if (await ask('So‘rovni o‘chirasizmi? Izohlar ham o‘chadi.')) act(() => deleteChangeRequestAction(d.id), 'O‘chirildi', () => setSel(null));
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>

            {isLead && DECISION_FLOW[d.status].some((s) => s === 'approved' || s === 'rejected' || s === 'review') && d.status !== 'draft' && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-au-line bg-au-card-2 p-3">
                <b className="text-xs text-au-muted uppercase">Rahbariyat qarori</b>
                <input className="sx-inp !h-[32px]" placeholder="Izoh (rad etishda majburiy)" value={note} onChange={(e) => setNote(e.target.value)} />
                <div className="flex flex-wrap gap-1.5">
                  {d.status === 'review' && (
                    <>
                      <button className="sx-btn primary sm" disabled={pending} onClick={() => act(() => moveDecisionAction({ id: d.id, to: 'approved', note }), 'Tasdiqlandi', () => setNote(''))}>
                        Tasdiqlash
                      </button>
                      <button className="sx-btn sm text-au-bad" disabled={pending || note.trim().length < 3} onClick={() => act(() => moveDecisionAction({ id: d.id, to: 'rejected', note }), 'Rad etildi', () => setNote(''))}>
                        Rad etish
                      </button>
                    </>
                  )}
                  {(d.status === 'approved' || d.status === 'rejected') && !d.applied_at && (
                    <button className="sx-btn sm" disabled={pending} onClick={() => act(() => moveDecisionAction({ id: d.id, to: 'review' }), 'Qayta ko‘rib chiqishga qaytarildi')}>
                      Qayta ko‘rib chiqish
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <b className="text-xs text-au-muted uppercase">Muhokama</b>
              {data.comments
                .filter((c) => c.cr_id === d.id)
                .map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-sm">
                    <PersonAvatar person={c.author_id ? personById.get(c.author_id) : undefined} size={22} />
                    <div className="min-w-0 flex-1">
                      <span className="text-[11px] text-au-muted">
                        {fullName(c.author_id ? personById.get(c.author_id) : undefined)} · {fmtDay(d10(c.created_at))}
                      </span>
                      <p className="whitespace-pre-wrap">{c.body}</p>
                    </div>
                    {c.author_id === viewerId && (
                      <button className="text-au-muted hover:text-au-bad" onClick={() => act(() => deleteCrCommentAction(c.id))} aria-label="O‘chirish">
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              <div className="flex gap-1.5">
                <input className="sx-inp !h-[32px] flex-1" placeholder="Izoh yozing…" value={cm} onChange={(e) => setCm(e.target.value)} />
                <button className="sx-btn sm" disabled={pending || !cm.trim()} onClick={() => act(() => commentChangeRequestAction({ id: d.id, body: cm }), undefined, () => setCm(''))}>
                  Yuborish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ PDF */

const latin = (s: string) => s.replace(/[‘’ʻʼ`]/g, "'").replace(/[−–—]/g, '-').replace(/·/g, '-').replace(/→/g, '->');

async function exportStatusPdf(p: PH, data: PfData, personById: Map<string, StrategyPerson>) {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  const rag = p.last?.rag ?? p.suggestion.rag;
  const col = ({ green: [19, 154, 82], amber: [224, 138, 0], red: [229, 72, 77] } as const)[rag];
  doc.setFillColor(27, 31, 42);
  doc.rect(0, 0, 210, 26, 'F');
  doc.setTextColor(255);
  doc.setFontSize(15);
  doc.text(latin(p.s.name), 14, 12);
  doc.setFontSize(9);
  doc.text(latin(`Loyiha holati - ${new Date().toISOString().slice(0, 10)} - mas'ul: ${fullName(p.s.owner_id ? personById.get(p.s.owner_id) : undefined)}`), 14, 19);
  doc.setFillColor(col[0], col[1], col[2]);
  doc.roundedRect(162, 8, 34, 10, 2, 2, 'F');
  doc.text(latin(RAG_META[rag].n), 179, 14.5, { align: 'center' });
  doc.setTextColor(20);
  autoTable(doc, {
    startY: 32,
    head: [['Bajarildi', "Vaqt o'tdi", 'Orqada', 'Kechikkan', 'Yuqori xavf', 'Muddat']],
    body: [[`${Math.round(p.progress)}%`, `${Math.round(p.elapsed)}%`, `${Math.max(0, Math.round(p.behind))} punkt`, `${p.late.length}/${p.ts.length}`, p.highRisks, p.s.end_date]],
    headStyles: { fillColor: [45, 52, 70] },
    styles: { fontSize: 9 },
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  if (p.last) {
    doc.setFontSize(10);
    doc.text(latin(`Oxirgi holat (${d10(p.last.created_at)}):`), 14, y);
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(latin(p.last.summary + (p.last.next_steps ? `\nKeyingi hafta: ${p.last.next_steps}` : '')), 182);
    doc.text(lines, 14, y + 5);
    y += 8 + lines.length * 4;
  }
  const table = (head: string[], body: (string | number)[][]) => {
    autoTable(doc, { startY: y, head: [head], body: body.length ? body : [head.map(() => '-')], headStyles: { fillColor: [45, 52, 70] }, styles: { fontSize: 9 } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };
  table(['Milestone', 'Sana'], data.milestones.filter((m) => m.space_id === p.s.id).slice(0, 8).map((m) => [latin(m.title), m.date]));
  table(['Kechikkan vazifa', 'Muddat'], p.late.slice(0, 15).map((t) => [latin(t.title), t.end_date]));
  table(['Xavf', 'Ball', 'Nima qilamiz'], p.risks.map((r) => [latin(r.title), riskScore(r), latin(r.mitigation ?? '')]));
  table(['Qaror', 'Holat'], p.decisions.map((d) => [latin(d.title), latin(DECISION_STATUS_LABEL[d.status])]));
  doc.save(`holat-${latin(p.s.name).replace(/\s+/g, '-')}.pdf`);
}

