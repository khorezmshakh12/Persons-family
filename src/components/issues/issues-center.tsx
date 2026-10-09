'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { useNow } from 'next-intl';
import { toast } from 'sonner';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BarChart3,
  Bug,
  Check,
  CheckCircle2,
  Clock3,
  EyeOff,
  Hourglass,
  Inbox,
  Lightbulb,
  ListChecks,
  Loader2,
  MessageSquare,
  Mic,
  Pencil,
  Plus,
  Repeat2,
  Search,
  Send,
  Sparkles,
  Square,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  CARD_TITLE,
  CHIP_ACCENT,
  CHIP_BAD,
  CHIP_INFO,
  CHIP_NEUTRAL,
  CHIP_OK,
  INPUT,
  SURFACE_CARD,
  SURFACE_HERO,
  SURFACE_INSET,
} from '@/lib/glass';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import {
  addIssueCommentAction,
  confirmIssueAction,
  createIssueAction,
  deleteIssueAction,
  getIssuesCenterAction,
  issueToTaskAction,
  moveIssueAction,
  requestIssueVoiceUploadUrlAction,
  setIssueMetaAction,
  updateIssueAction,
  type CenterIssue,
  type IssuesCenter,
  type MonthlyIssueArchiveEntry,
} from '@/lib/actions/issues';
import type { IssueStats } from '@/lib/actions/issue-stats';
import {
  AUTO_CLOSE_DAYS,
  fmtSpan,
  ISSUE_KINDS,
  KIND_META,
  MOVE_LABEL,
  PRIORITIES,
  PRIORITY_META,
  priorityFromUrgency,
  similarIssues,
  slaOf,
  STAGE_META,
  STAGE_MOVES,
  stageOf,
  type IssueKind,
  type Priority,
  type Stage,
} from '@/lib/issues-flow';
import { AiTriageButton } from './ai-triage-button';
import { IssueAiChips } from './issue-ai-chips';
import { IssuesStats } from './issues-stats';

/* ------------------------------------------------------------ shared bits */

type Person = { id: string; name: string };
type View = 'queue' | 'waiting' | 'closed' | 'stats' | 'archive';

const ERR: Record<string, string> = {
  sessionExpired: 'Sessiya tugagan — sahifani yangilang',
  forbidden: 'Ruxsat yo‘q',
  invalidInput: 'Ma’lumotni tekshiring',
  invalidTransition: 'Bu bosqichdan bunday o‘tib bo‘lmaydi',
  conflict: 'Kimdir hozirgina o‘zgartirdi — ro‘yxat yangilandi',
  resolutionNote: 'Nima qilinganini qisqacha yozing',
  reopenReason: 'Nima hal bo‘lmaganini yozing',
  invalidAssignee: 'Bu xodimni tanlab bo‘lmaydi',
  cannotAssign: 'Bu xodimga vazifa bera olmaysiz',
  deadlinePast: 'Muddat kelajakda bo‘lishi kerak',
  alreadyLinked: 'Bu murojaat allaqachon vazifaga aylantirilgan',
  anonymousIdea: 'Anonim murojaat faqat «Taklif» bo‘lib qoladi',
  notFound: 'Murojaat topilmadi',
  commentInvalid: 'Izoh bo‘sh',
};
const errText = (c?: string) => (c ? (ERR[c] ?? 'Saqlab bo‘lmadi, qayta urinib ko‘ring') : '');

const TONE_CHIP = { info: CHIP_INFO, accent: CHIP_ACCENT, ok: CHIP_OK, neutral: CHIP_NEUTRAL, bad: CHIP_BAD } as const;
const PRIORITY_BAR: Record<Priority, string> = { urgent: 'bg-au-bad', high: 'bg-au-accent', normal: 'bg-au-line' };
const PRIORITY_CHIP: Record<Priority, string> = { urgent: CHIP_BAD, high: CHIP_ACCENT, normal: CHIP_NEUTRAL };
const KIND_ICON: Record<IssueKind, ReactNode> = {
  problem: <Wrench className="size-3.5" />,
  request: <Inbox className="size-3.5" />,
  idea: <Lightbulb className="size-3.5" />,
};
const EVENT_LABEL: Record<string, string> = {
  created: 'Yuborildi',
  accepted: 'Qabul qilindi',
  in_progress: 'Ish boshlandi',
  resolved: 'Hal qilindi',
  reopened: 'Qayta ochildi',
  confirmed: 'Muallif tasdiqladi — yopildi',
  rejected_fix: 'Muallif: hal bo‘lmadi — qayta ochildi',
  auto_closed: 'Avtomatik yopildi',
  priority: 'Ustuvorlik o‘zgardi',
  kind: 'Turi o‘zgardi',
  assigned: 'Topshirildi',
  task_linked: 'Vazifaga aylantirildi',
  root_cause: 'Ildiz sababi yozildi',
};
const FLOW: { s: Stage; n: string }[] = [
  { s: 'new', n: 'Yuborildi' },
  { s: 'accepted', n: 'Qabul qilindi' },
  { s: 'in_progress', n: 'Jarayonda' },
  { s: 'resolved', n: 'Hal qilindi' },
  { s: 'closed', n: 'Tasdiqlandi' },
];

const dt = (iso: string) =>
  new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

/** "YYYY-MM-DDTHH:mm" in Tashkent, `days` from now at 18:00. */
function tashkentInput(nowMs: number, days: number): string {
  const d = new Date(nowMs + 5 * 3_600_000 + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T18:00`;
}

function SlaPill({ i, now }: { i: CenterIssue; now: number }) {
  const s = slaOf(i, now);
  if (!s) return null;
  const label = s.what === 'respond' ? 'javob' : 'hal qilish';
  if (s.breached)
    return (
      <span className={CHIP_BAD} title={`Muddat: ${dt(new Date(s.dueMs).toISOString())}`}>
        <AlertTriangle className="size-3" /> {label}: {fmtSpan(s.leftMs)} o‘tdi
      </span>
    );
  const warn = (s.pctUsed ?? 0) >= 75;
  return (
    <span className={warn ? CHIP_ACCENT : CHIP_NEUTRAL} title={`Muddat: ${dt(new Date(s.dueMs).toISOString())}`}>
      <Clock3 className="size-3" /> {label}: {fmtSpan(s.leftMs)} qoldi
    </span>
  );
}

function StageChip({ i }: { i: CenterIssue }) {
  const st = stageOf(i);
  return <span className={TONE_CHIP[STAGE_META[st].tone]}>{st === 'resolved' ? 'Tasdiq kutilmoqda' : STAGE_META[st].n}</span>;
}

function Stepper({ stage }: { stage: Stage }) {
  const at = FLOW.findIndex((f) => f.s === stage);
  return (
    <ol className="flex items-center gap-1" aria-label="Bosqichlar">
      {FLOW.map((f, k) => (
        <li key={f.s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <span className="flex w-full items-center">
            <span className={cn('h-0.5 flex-1', k === 0 ? 'opacity-0' : k <= at ? 'bg-au-ok' : 'bg-au-line')} />
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                k < at || stage === 'closed' ? 'bg-au-ok text-white' : k === at ? 'bg-au-primary text-white ring-4 ring-au-primary/15' : 'bg-au-card-2 text-au-muted',
              )}
            >
              {k < at || stage === 'closed' ? <Check className="size-3.5" /> : k + 1}
            </span>
            <span className={cn('h-0.5 flex-1', k === FLOW.length - 1 ? 'opacity-0' : k < at ? 'bg-au-ok' : 'bg-au-line')} />
          </span>
          <span className={cn('truncate text-[10px] font-semibold sm:text-[11px]', k === at ? 'text-au-ink' : 'text-au-muted')}>{f.n}</span>
        </li>
      ))}
    </ol>
  );
}

function Kpi({ label, value, hint, tone, onClick, active }: { label: string; value: ReactNode; hint?: string; tone?: 'bad' | 'ok' | 'info'; onClick?: () => void; active?: boolean }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        SURFACE_INSET,
        'flex min-w-0 flex-col gap-0.5 px-3.5 py-2.5 text-left',
        onClick && 'transition-colors hover:bg-au-card',
        active && 'ring-2 ring-au-primary/30',
      )}
    >
      <span className="truncate text-[11px] font-semibold tracking-wide text-au-muted uppercase">{label}</span>
      <span className={cn('text-xl font-bold tabular-nums', tone === 'bad' ? 'text-au-bad' : tone === 'ok' ? 'text-au-ok' : tone === 'info' ? 'text-au-info' : 'text-au-ink')}>{value}</span>
      {hint && <span className="truncate text-[11px] text-au-muted">{hint}</span>}
    </Tag>
  );
}

/* ------------------------------------------------------------ main */

export function IssuesCenterView({
  initial,
  archive,
  stats,
  assignees,
  taskPeople,
  focusId,
  openNew,
}: {
  initial: IssuesCenter;
  archive: MonthlyIssueArchiveEntry[];
  stats: IssueStats | null;
  assignees: Person[];
  taskPeople: Person[];
  focusId: string | null;
  openNew: boolean;
}) {
  const router = useRouter();
  const now = useNow({ updateInterval: 60_000 }).getTime();
  const [data, setData] = useState(initial);
  const { manager, viewerId } = data;
  const [view, setView] = useState<View>('queue');
  const [openId, setOpenId] = useState<string | null>(focusId);
  const [creating, setCreating] = useState(openNew);

  // Server re-render (router.refresh / a bell link to ?id=…) hands us a
  // fresh snapshot and maybe a new issue to open.
  const [seen, setSeen] = useState({ initial, focusId, openNew });
  if (seen.initial !== initial || seen.focusId !== focusId || seen.openNew !== openNew) {
    setSeen({ initial, focusId, openNew });
    setData(initial);
    if (focusId && focusId !== seen.focusId) setOpenId(focusId);
    if (openNew && !seen.openNew) setCreating(true);
  }

  const reload = useCallback(async () => {
    const next = await getIssuesCenterAction();
    if (next) setData(next);
  }, []);

  // Live: every write bumps board_signals/issues.
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        let first = true;
        off = onSnapshot(doc(getRealtimeDb(), 'board_signals', 'issues'), () => {
          if (first) {
            first = false;
            return;
          }
          reload();
        });
      })
      .catch((e) => console.error('issues realtime failed', e));
    return () => {
      cancelled = true;
      off?.();
    };
  }, [reload]);

  const issues = data.issues;
  const byId = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);
  const open = openId ? (byId.get(openId) ?? null) : null;

  // Recurrence: managers see "this keeps happening" across the board.
  const pool = useMemo(
    () => issues.map((i) => ({ id: i.id, title: i.title, description: i.description, category: i.ai?.category ?? null, created_at: i.created_at })),
    [issues],
  );
  const similarCount = useMemo(() => {
    if (!manager) return new Map<string, number>();
    return new Map(pool.map((p) => [p.id, similarIssues(p, pool).length]));
  }, [pool, manager]);

  const active = issues.filter((i) => i.status !== 'done');
  const waiting = issues.filter((i) => stageOf(i) === 'resolved');
  const closed = issues.filter((i) => stageOf(i) === 'closed');
  const myConfirm = waiting.filter((i) => i.isMine);

  const tabs: { v: View; n: string; c?: number; Icon: typeof Inbox }[] = [
    { v: 'queue', n: manager ? 'Navbat' : 'Faol', c: active.length, Icon: Inbox },
    { v: 'waiting', n: 'Tasdiq kutilmoqda', c: waiting.length, Icon: Hourglass },
    { v: 'closed', n: 'Yopilgan (14 kun)', Icon: CheckCircle2 },
    ...(manager ? [{ v: 'stats' as View, n: 'Statistika', Icon: BarChart3 }] : []),
    { v: 'archive', n: 'Arxiv', Icon: Archive },
  ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-1 pb-10 sm:px-7">
      <section className={cn(SURFACE_HERO, 'ms-rise flex flex-col gap-4 px-6 py-6 sm:px-8')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">Murojaatlar</h1>
            <p className="max-w-2xl text-sm text-au-muted">
              {manager
                ? 'Xodimlarning muammo, so‘rov va takliflari — muddatida javob berish, hal qilish va muallif tasdig‘i bitta joyda.'
                : 'Muammo, so‘rov yoki taklif yuboring — kim va qachon hal qilishini shu yerda kuzatasiz.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {manager && <AiTriageButton />}
            <button type="button" className={BTN_PRIMARY} onClick={() => setCreating(true)}>
              <Plus className="size-4" /> Yangi murojaat
            </button>
          </div>
        </div>
        <div className="hidden sm:block">
          <Stepper stage="new" />
          <p className="mt-2 text-center text-[11px] text-au-muted">
            Har bir murojaat shu yo‘ldan o‘tadi. Hal qilingach muallif tasdiqlaydi; {AUTO_CLOSE_DAYS} kun javob bo‘lmasa, o‘zi yopiladi.
          </p>
        </div>
      </section>

      {myConfirm.length > 0 && (
        <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-2 border-au-ok/40 p-4')}>
          <h2 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
            <ThumbsUp className="size-4 text-au-ok" /> Sizdan tasdiq kutilmoqda
          </h2>
          {myConfirm.map((i) => (
            <button key={i.id} type="button" onClick={() => setOpenId(i.id)} className={cn(SURFACE_INSET, 'flex items-center gap-3 px-3 py-2 text-left hover:bg-au-card')}>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{i.title}</span>
              <span className="text-xs text-au-muted">hal bo‘ldimi?</span>
              <ArrowRight className="size-4 text-au-muted" />
            </button>
          ))}
        </section>
      )}

      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-au-ctl border border-au-line bg-au-card-2 p-1">
        {tabs.map(({ v, n, c, Icon }) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold transition-colors',
              view === v ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink',
            )}
          >
            <Icon className="size-4" />
            {n}
            {!!c && <span className="rounded-full bg-au-card-2 px-1.5 text-[11px] tabular-nums">{c}</span>}
          </button>
        ))}
      </div>

      {view === 'queue' && (
        <Queue
          issues={active}
          manager={manager}
          viewerId={viewerId}
          now={now}
          similarCount={similarCount}
          assignees={assignees}
          onOpen={setOpenId}
          empty={manager ? 'Navbat bo‘sh — hamma murojaatlar hal qilingan 🎉' : 'Faol murojaatingiz yo‘q. Muammo yoki taklif bo‘lsa — «Yangi murojaat».'}
        />
      )}
      {view === 'waiting' && (
        <Queue issues={waiting} manager={manager} viewerId={viewerId} now={now} similarCount={similarCount} assignees={[]} onOpen={setOpenId} empty="Tasdiq kutayotgan murojaat yo‘q." compact />
      )}
      {view === 'closed' && (
        <Queue issues={closed} manager={manager} viewerId={viewerId} now={now} similarCount={similarCount} assignees={[]} onOpen={setOpenId} empty="So‘nggi 14 kunda yopilgan murojaat yo‘q." compact />
      )}
      {view === 'stats' && manager && <StatsView stats={stats} />}
      {view === 'archive' && <ArchiveView archive={archive} />}

      {open && (
        <Drawer
          key={open.id}
          i={open}
          manager={manager}
          viewerId={viewerId}
          now={now}
          pool={pool}
          byId={byId}
          assignees={assignees}
          taskPeople={taskPeople}
          onClose={() => setOpenId(null)}
          onOpen={setOpenId}
          onChanged={reload}
        />
      )}
      {creating && (
        <CreateDialog
          manager={manager}
          assignees={assignees}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            reload().then(() => setOpenId(id));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ queue */

function Queue({
  issues,
  manager,
  viewerId,
  now,
  similarCount,
  assignees,
  onOpen,
  empty,
  compact,
}: {
  issues: CenterIssue[];
  manager: boolean;
  viewerId: string;
  now: number;
  similarCount: Map<string, number>;
  assignees: Person[];
  onOpen: (id: string) => void;
  empty: string;
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<IssueKind | 'all'>('all');
  const [prio, setPrio] = useState<Priority | 'all'>('all');
  const [who, setWho] = useState('all');
  const [quick, setQuick] = useState<'none' | 'new' | 'late' | 'unassigned'>('none');

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank = (i: CenterIssue) => {
      const s = slaOf(i, now);
      return s ? (s.breached ? -1e15 + s.leftMs : s.leftMs) : 1e15;
    };
    return issues
      .filter((i) => {
        if (kind !== 'all' && i.kind !== kind) return false;
        if (prio !== 'all' && i.priority !== prio) return false;
        if (who !== 'all' && (who === 'none' ? i.assigned_to : i.assigned_to !== who)) return false;
        if (quick === 'new' && stageOf(i) !== 'new') return false;
        if (quick === 'late' && !slaOf(i, now)?.breached) return false;
        if (quick === 'unassigned' && i.assigned_to) return false;
        if (!needle) return true;
        return `${i.title} ${i.description ?? ''} ${i.reporterName} ${i.assigneeName ?? ''}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => (compact ? (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at) : rank(a) - rank(b) || PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority)));
  }, [issues, q, kind, prio, who, quick, now, compact]);

  const late = issues.filter((i) => slaOf(i, now)?.breached).length;
  const fresh = issues.filter((i) => stageOf(i) === 'new').length;
  const mineToDo = issues.filter((i) => i.assigned_to === viewerId).length;

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label="Yangi" value={fresh} hint="javob kutmoqda" tone={fresh ? 'info' : undefined} onClick={() => setQuick(quick === 'new' ? 'none' : 'new')} active={quick === 'new'} />
          <Kpi label="Muddati o‘tgan" value={late} hint="javob yoki hal qilish" tone={late ? 'bad' : 'ok'} onClick={() => setQuick(quick === 'late' ? 'none' : 'late')} active={quick === 'late'} />
          <Kpi label="Menga topshirilgan" value={mineToDo} hint="men hal qilaman" />
          {manager ? (
            <Kpi
              label="Mas’ulsiz"
              value={issues.filter((i) => !i.assigned_to).length}
              hint="hech kimga berilmagan"
              onClick={() => setQuick(quick === 'unassigned' ? 'none' : 'unassigned')}
              active={quick === 'unassigned'}
            />
          ) : (
            <Kpi label="Jami faol" value={issues.length} />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-au-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish: sarlavha, muallif, mas’ul…" className={cn(INPUT, 'h-9 pl-9')} />
        </label>
        <Seg value={kind} onChange={setKind} options={[['all', 'Hammasi'], ...ISSUE_KINDS.map((k) => [k, KIND_META[k].n] as [IssueKind, string])]} />
        {!compact && <Seg value={prio} onChange={setPrio} options={[['all', 'Har qanday'], ...PRIORITIES.map((p) => [p, PRIORITY_META[p].n] as [Priority, string])]} />}
        {manager && assignees.length > 0 && !compact && (
          <select value={who} onChange={(e) => setWho(e.target.value)} className={cn(INPUT, 'h-9 w-auto')} aria-label="Mas’ul">
            <option value="all">Barcha mas’ullar</option>
            <option value="none">Mas’ulsiz</option>
            {assignees.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {list.length === 0 ? (
        <div className={cn(SURFACE_CARD, 'px-6 py-12 text-center text-sm text-au-muted')}>{issues.length ? 'Filtr bo‘yicha hech narsa topilmadi.' : empty}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((i, k) => (
            <li key={i.id} style={{ ['--i' as string]: Math.min(k, 12) }} className="ms-rise">
              <button
                type="button"
                onClick={() => onOpen(i.id)}
                className={cn(SURFACE_CARD, 'group relative flex w-full items-stretch gap-3 overflow-hidden py-3 pr-4 pl-5 text-left transition-shadow hover:shadow-au-card-hover')}
              >
                <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', PRIORITY_BAR[i.priority])} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className={CHIP_NEUTRAL}>
                      {KIND_ICON[i.kind]} {KIND_META[i.kind].n}
                    </span>
                    <StageChip i={i} />
                    {i.priority !== 'normal' && <span className={PRIORITY_CHIP[i.priority]}>{PRIORITY_META[i.priority].n}</span>}
                    <SlaPill i={i} now={now} />
                    {i.anonymous && (
                      <span className={CHIP_NEUTRAL}>
                        <EyeOff className="size-3" /> Anonim
                      </span>
                    )}
                    {manager && (similarCount.get(i.id) ?? 0) >= 1 && (
                      <span className={CHIP_ACCENT} title="30 kun ichidagi o‘xshash murojaatlar">
                        <Repeat2 className="size-3" /> {(similarCount.get(i.id) ?? 0) + 1}-marta
                      </span>
                    )}
                    {i.reopen_count > 0 && <span className={CHIP_BAD}>↩ {i.reopen_count}× qayta ochilgan</span>}
                  </span>
                  <span className="truncate text-[15px] font-semibold text-au-ink">{i.title}</span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-au-muted">
                    <span>
                      {i.isMine ? 'Siz' : i.reporterName} → {i.assigned_to === viewerId ? 'siz' : (i.assigneeName ?? 'mas’ul yo‘q')}
                    </span>
                    <span>{dt(i.created_at)}</span>
                    {i.comments.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" /> {i.comments.length}
                      </span>
                    )}
                    {i.task && (
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="size-3" /> vazifa
                      </span>
                    )}
                    {i.rating && (
                      <span className="inline-flex items-center gap-0.5 text-au-accent-text">
                        <Star className="size-3 fill-current" /> {i.rating}
                      </span>
                    )}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 self-center text-au-muted transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-0.5">
      {options.map(([v, n]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn('h-8 rounded-[9px] px-2.5 text-xs font-semibold transition-colors', value === v ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ drawer */

function Drawer({
  i,
  manager,
  viewerId,
  now,
  pool,
  byId,
  assignees,
  taskPeople,
  onClose,
  onOpen,
  onChanged,
}: {
  i: CenterIssue;
  manager: boolean;
  viewerId: string;
  now: number;
  pool: { id: string; title: string; description: string | null; category: string | null; created_at: string }[];
  byId: Map<string, CenterIssue>;
  assignees: Person[];
  taskPeople: Person[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const stage = stageOf(i);
  const canWork = manager || i.assigned_to === viewerId;
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.error) {
        toast.error(errText(res.error));
        if (res.error === 'conflict') await onChanged();
        return;
      }
      if (ok) toast.success(ok);
      after?.();
      await onChanged();
    });

  const similar = manager
    ? similarIssues({ id: i.id, title: i.title, description: i.description, category: i.ai?.category ?? null, created_at: i.created_at }, pool)
    : [];
  const aiPriority = priorityFromUrgency(i.ai?.urgency);
  const moves = canWork ? STAGE_MOVES[stage] : [];

  const timeline = [
    ...i.events.map((e) => ({ k: `e${e.id}`, at: e.created_at, ev: e })),
    ...i.comments.map((c) => ({ k: `c${c.id}`, at: c.created_at, c })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={i.title}>
      <button type="button" aria-label="Yopish" onClick={onClose} className="absolute inset-0 bg-black/30 animate-in fade-in-0" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-[600px] flex-col overflow-hidden border-l border-au-line bg-au-bg shadow-2xl outline-none animate-in slide-in-from-right-8 duration-200 motion-reduce:animate-none"
      >
        <header className="flex items-start gap-3 border-b border-au-line bg-au-card px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={CHIP_NEUTRAL}>
                {KIND_ICON[i.kind]} {KIND_META[i.kind].n}
              </span>
              <span className={PRIORITY_CHIP[i.priority]}>{PRIORITY_META[i.priority].n}</span>
              <StageChip i={i} />
              <SlaPill i={i} now={now} />
            </div>
            {editing ? (
              <EditText i={i} onDone={() => setEditing(false)} onSaved={onChanged} />
            ) : (
              <h2 className="text-lg leading-snug font-bold text-au-ink">{i.title}</h2>
            )}
            <p className="text-xs text-au-muted">
              {i.isMine ? 'Siz' : i.reporterName} · {dt(i.created_at)} · Mas’ul: {i.assigned_to === viewerId ? 'siz' : (i.assigneeName ?? 'belgilanmagan')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {manager && !editing && (
              <button type="button" onClick={() => setEditing(true)} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink" aria-label="Tahrirlash">
                <Pencil className="size-4" />
              </button>
            )}
            <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink" aria-label="Yopish">
              <X className="size-5" />
            </button>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Stepper stage={stage} />

          {(i.description || i.voiceSignedUrl) && (
            <section className={cn(SURFACE_INSET, 'flex flex-col gap-2 p-3.5')}>
              {i.description && <p className="text-sm whitespace-pre-wrap text-au-ink">{i.description}</p>}
              {i.voiceSignedUrl && <audio controls preload="none" src={i.voiceSignedUrl} className="h-9 w-full" />}
            </section>
          )}
          {manager && <IssueAiChips ai={i.ai} />}

          {/* Reporter's verdict */}
          {i.isMine && stage === 'resolved' && <ConfirmBox i={i} pending={pending} run={run} />}

          {/* Work actions */}
          {moves.length > 0 && (
            <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
              <h3 className={CARD_TITLE}>{stage === 'resolved' || stage === 'closed' ? 'Qayta ochish' : 'Keyingi qadam'}</h3>
              {resolving ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Nima qilindi? Muallif shuni o‘qib tasdiqlaydi."
                    className={cn(INPUT, 'h-auto py-2.5')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={pending || note.trim().length < 3}
                      className={BTN_PRIMARY}
                      onClick={() => run(() => moveIssueAction({ id: i.id, to: 'resolved', note }), i.isMine ? 'Yopildi' : 'Hal qilindi — muallifdan tasdiq so‘raldi', () => setResolving(false))}
                    >
                      {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} Hal qilindi
                    </button>
                    <button type="button" className={BTN_SECONDARY} onClick={() => setResolving(false)}>
                      Bekor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {moves.map((to) =>
                    to === 'resolved' ? (
                      <button key={to} type="button" disabled={pending} className={BTN_PRIMARY} onClick={() => setResolving(true)}>
                        <CheckCircle2 className="size-4" /> Hal qilindi…
                      </button>
                    ) : (
                      <button
                        key={to}
                        type="button"
                        disabled={pending}
                        className={BTN_SECONDARY}
                        onClick={() => run(() => moveIssueAction({ id: i.id, to }), STAGE_META[to].n)}
                      >
                        {stage === 'resolved' || stage === 'closed' ? 'Qayta ochish' : to === 'accepted' && stage === 'in_progress' ? 'Qabulga qaytarish' : MOVE_LABEL[to]}
                      </button>
                    ),
                  )}
                </div>
              )}
              {stage === 'new' && <p className="text-xs text-au-muted">«Qabul qilish» — muallifga «ko‘rdik» degan xabar boradi va javob muddati bajariladi.</p>}
            </section>
          )}

          {/* Task link */}
          {i.task ? (
            <section className={cn(SURFACE_INSET, 'flex items-center gap-3 p-3')}>
              <ListChecks className="size-5 text-au-accent-text" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{i.task.title}</p>
                <p className="text-xs text-au-muted">
                  Vazifa · {i.task.assigneeName ?? '—'} · {i.task.status === 'done' ? 'bajarildi' : 'jarayonda'} — bajarilganda murojaat o‘zi «Hal qilindi»ga o‘tadi
                </p>
              </div>
              <Link href="/tasks" className="text-xs font-semibold text-au-muted hover:text-au-ink">
                Ochish →
              </Link>
            </section>
          ) : (
            canWork && i.status !== 'done' && taskPeople.length > 0 && <ToTask i={i} people={taskPeople} now={now} pending={pending} run={run} />
          )}

          {/* Manager triage */}
          {manager && (
            <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
              <h3 className={CARD_TITLE}>Boshqaruv</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
                  Ustuvorlik
                  <select
                    value={i.priority}
                    disabled={pending}
                    onChange={(e) => run(() => setIssueMetaAction({ id: i.id, priority: e.target.value as Priority }), 'Ustuvorlik o‘zgardi — muddatlar qayta hisoblandi')}
                    className={cn(INPUT, 'h-9')}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_META[p].n} ({PRIORITY_META[p].respondH} soat / {Math.round(PRIORITY_META[p].resolveH / 24)} kun)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
                  Turi
                  <select
                    value={i.kind}
                    disabled={pending || i.anonymous}
                    onChange={(e) => run(() => setIssueMetaAction({ id: i.id, kind: e.target.value as IssueKind }), 'Turi o‘zgardi')}
                    className={cn(INPUT, 'h-9')}
                  >
                    {ISSUE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {KIND_META[k].n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
                  Mas’ul
                  <select
                    value={i.assigned_to ?? ''}
                    disabled={pending}
                    onChange={(e) => run(() => setIssueMetaAction({ id: i.id, assignedTo: e.target.value || null }), 'Topshirildi')}
                    className={cn(INPUT, 'h-9')}
                  >
                    <option value="">— belgilanmagan —</option>
                    {assignees.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {aiPriority && aiPriority !== i.priority && i.status !== 'done' && (
                <div className="flex flex-wrap items-center gap-2 rounded-au-ctl bg-au-accent-soft px-3 py-2 text-xs text-au-accent-text">
                  <Sparkles className="size-3.5" /> Jev taklifi: <b>{PRIORITY_META[aiPriority].n}</b>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setIssueMetaAction({ id: i.id, priority: aiPriority }), 'Qo‘llandi')}
                    className="ml-auto rounded-full bg-au-card px-2.5 py-1 font-semibold text-au-ink hover:bg-au-card-2"
                  >
                    Qo‘llash
                  </button>
                </div>
              )}
              {(i.ai?.itBug ?? 0) >= 0.6 && (
                <p className="flex items-center gap-1.5 text-xs text-au-bad">
                  <Bug className="size-3.5" /> Jev: bu sayt/dastur xatosiga o‘xshaydi — IT mas’ulga topshiring.
                </p>
              )}
              <div className="flex justify-end">
                {confirmDelete ? (
                  <span className="flex items-center gap-2 text-xs">
                    Rostdan o‘chirilsinmi? Qaytarib bo‘lmaydi.
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-full bg-au-bad px-3 py-1 font-semibold text-white"
                      onClick={() => {
                        const fd = new FormData();
                        fd.set('id', i.id);
                        run(() => deleteIssueAction(fd), 'O‘chirildi', onClose);
                      }}
                    >
                      Ha, o‘chirish
                    </button>
                    <button type="button" className="font-semibold text-au-muted" onClick={() => setConfirmDelete(false)}>
                      Yo‘q
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-au-muted hover:text-au-bad">
                    <Trash2 className="size-3.5" /> O‘chirish
                  </button>
                )}
              </div>
            </section>
          )}

          {/* Recurrence */}
          {manager && (similar.length > 0 || i.root_cause) && <RootCause i={i} similar={similar.map((s) => byId.get(s.id)!).filter(Boolean)} pending={pending} run={run} onOpen={onOpen} />}

          {/* Timeline */}
          <section className="flex flex-col gap-2">
            <h3 className={CARD_TITLE}>Tarix va muhokama</h3>
            <ol className="flex flex-col gap-2">
              {timeline.map((t) =>
                'ev' in t && t.ev ? (
                  <li key={t.k} className="flex items-start gap-2 text-xs text-au-muted">
                    <span className="mt-1 size-1.5 shrink-0 rounded-full bg-au-muted" />
                    <span className="min-w-0 flex-1">
                      <b className="text-au-ink">{EVENT_LABEL[t.ev.kind] ?? t.ev.kind}</b>
                      {t.ev.actorName ? ` · ${t.ev.actorName}` : ''} · {dt(t.at)}
                      {t.ev.note && <span className="mt-0.5 block whitespace-pre-wrap text-au-ink">{t.ev.note}</span>}
                    </span>
                  </li>
                ) : 'c' in t && t.c ? (
                  <li key={t.k} className={cn('flex flex-col gap-1 rounded-au-ctl px-3 py-2', t.c.author_id === viewerId ? 'ml-6 bg-au-info-soft' : 'mr-6 border border-au-line bg-au-card')}>
                    <span className="text-[11px] font-semibold text-au-muted">
                      {t.c.author_id === viewerId ? 'Siz' : t.c.authorName}
                      {t.c.authorRole === 'assignee' ? ' · mas’ul' : t.c.authorRole === 'author' ? ' · muallif' : t.c.authorRole === 'manager' ? ' · rahbariyat' : ''} · {dt(t.at)}
                    </span>
                    <span className="text-sm whitespace-pre-wrap text-au-ink">{t.c.body}</span>
                  </li>
                ) : null,
              )}
            </ol>
          </section>
        </div>

        <Composer issueId={i.id} onSent={onChanged} />
      </div>
    </div>
  );
}

function ConfirmBox({ i, pending, run }: { i: CenterIssue; pending: boolean; run: (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) => void }) {
  const [rating, setRating] = useState(0);
  const [no, setNo] = useState(false);
  const [reason, setReason] = useState('');
  const resolvedNote = [...i.events].reverse().find((e) => e.kind === 'resolved')?.note;
  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 border-au-ok/50 p-4')}>
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <ThumbsUp className="size-4 text-au-ok" /> Murojaatingiz hal bo‘ldimi?
      </h3>
      {resolvedNote && <p className={cn(SURFACE_INSET, 'px-3 py-2 text-sm whitespace-pre-wrap')}>Nima qilindi: {resolvedNote}</p>}
      {!no ? (
        <>
          <div className="flex items-center gap-1" aria-label="Baho">
            <span className="mr-1 text-xs text-au-muted">Baho (ixtiyoriy):</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} yulduz`} className="p-0.5">
                <Star className={cn('size-5', n <= rating ? 'fill-au-accent text-au-accent' : 'text-au-line')} />
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} className={BTN_PRIMARY} onClick={() => run(() => confirmIssueAction({ id: i.id, ok: true, rating: rating || undefined }), 'Rahmat! Murojaat yopildi')}>
              <ThumbsUp className="size-4" /> Ha, hal bo‘ldi
            </button>
            <button type="button" disabled={pending} className={BTN_SECONDARY} onClick={() => setNo(true)}>
              <ThumbsDown className="size-4" /> Yo‘q, hal bo‘lmadi
            </button>
          </div>
          <p className="text-[11px] text-au-muted">{AUTO_CLOSE_DAYS} kun ichida javob bermasangiz, murojaat avtomatik yopiladi.</p>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} placeholder="Nima hal bo‘lmadi?" className={cn(INPUT, 'h-auto py-2.5')} />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || reason.trim().length < 3}
              className={BTN_PRIMARY}
              onClick={() => run(() => confirmIssueAction({ id: i.id, ok: false, note: reason }), 'Qayta ochildi — mas’ulga xabar berildi')}
            >
              Qayta ochish
            </button>
            <button type="button" className={BTN_SECONDARY} onClick={() => setNo(false)}>
              Orqaga
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ToTask({ i, people, now, pending, run }: { i: CenterIssue; people: Person[]; now: number; pending: boolean; run: (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState(i.assigned_to && people.some((p) => p.id === i.assigned_to) ? i.assigned_to : (people[0]?.id ?? ''));
  const [due, setDue] = useState(() => tashkentInput(now, i.priority === 'urgent' ? 0 : i.priority === 'high' ? 2 : 5));
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn(SURFACE_INSET, 'flex items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold hover:bg-au-card')}>
        <ListChecks className="size-4 text-au-accent-text" /> Vazifaga aylantirish
        <span className="ml-auto text-xs font-normal text-au-muted">ish ko‘p qadamli bo‘lsa</span>
      </button>
    );
  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4')}>
      <h3 className={CARD_TITLE}>Vazifaga aylantirish</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
          Kim bajaradi
          <select value={who} onChange={(e) => setWho(e.target.value)} className={cn(INPUT, 'h-9')}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
          Muddat (Toshkent)
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={cn(INPUT, 'h-9')} />
        </label>
      </div>
      <p className="text-xs text-au-muted">Vazifa bajarilganda murojaat o‘zi «Hal qilindi»ga o‘tadi va muallifdan tasdiq so‘raladi.</p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !who || !due}
          className={BTN_PRIMARY}
          onClick={() => run(() => issueToTaskAction({ id: i.id, assigneeId: who, deadline: `${due}:00+05:00` }), 'Vazifa yaratildi', () => setOpen(false))}
        >
          Yaratish
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={() => setOpen(false)}>
          Bekor
        </button>
      </div>
    </section>
  );
}

function RootCause({
  i,
  similar,
  pending,
  run,
  onOpen,
}: {
  i: CenterIssue;
  similar: CenterIssue[];
  pending: boolean;
  run: (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) => void;
  onOpen: (id: string) => void;
}) {
  const [text, setText] = useState(i.root_cause ?? '');
  return (
    <section className={cn(SURFACE_CARD, 'flex flex-col gap-3 border-au-accent/40 p-4')}>
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <Repeat2 className="size-4 text-au-accent-text" />
        {similar.length ? `Bu takrorlanyapti: 30 kunda ${similar.length + 1}-marta` : 'Ildiz sababi'}
      </h3>
      {similar.length > 0 && (
        <ul className="flex flex-col gap-1">
          {similar.slice(0, 6).map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onOpen(s.id)} className="flex w-full items-center gap-2 rounded-au-ctl px-2 py-1 text-left text-sm hover:bg-au-card-2">
                <span className="min-w-0 flex-1 truncate">{s.title}</span>
                <StageChip i={s} />
                <span className="text-[11px] text-au-muted">{dt(s.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-au-muted">Bir xil muammo qaytaversa, sababini yozing — keyingi safar shu yerdan ko‘rinadi.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="Masalan: 204-xona proyektori eskirgan — almashtirish kerak" className={cn(INPUT, 'h-auto py-2')} />
      <div>
        <button
          type="button"
          disabled={pending || text === (i.root_cause ?? '')}
          className={BTN_SECONDARY}
          onClick={() => run(() => setIssueMetaAction({ id: i.id, rootCause: text }), 'Saqlandi')}
        >
          Saqlash
        </button>
      </div>
    </section>
  );
}

function EditText({ i, onDone, onSaved }: { i: CenterIssue; onDone: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(i.title);
  const [desc, setDesc] = useState(i.description ?? '');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={cn(INPUT, 'h-9 font-semibold')} />
      <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} maxLength={2000} className={cn(INPUT, 'h-auto py-2')} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || title.trim().length < 3}
          className={cn(BTN_PRIMARY, 'h-9')}
          onClick={() =>
            start(async () => {
              const fd = new FormData();
              fd.set('id', i.id);
              fd.set('title', title);
              fd.set('description', desc);
              const res = await updateIssueAction(undefined, fd);
              if (res?.error) return void toast.error(errText(res.error));
              toast.success('Saqlandi');
              onDone();
              await onSaved();
            })
          }
        >
          Saqlash
        </button>
        <button type="button" className={cn(BTN_SECONDARY, 'h-9')} onClick={onDone}>
          Bekor
        </button>
      </div>
    </div>
  );
}

function Composer({ issueId, onSent }: { issueId: string; onSent: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [pending, start] = useTransition();
  const send = () =>
    start(async () => {
      const res = await addIssueCommentAction({ issueId, body });
      if (res.error) return void toast.error(errText(res.error));
      setBody('');
      await onSent();
    });
  return (
    <div className="flex items-end gap-2 border-t border-au-line bg-au-card px-4 py-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && body.trim()) send();
        }}
        rows={1}
        maxLength={2000}
        placeholder="Izoh yozing… (Ctrl+Enter)"
        className={cn(INPUT, 'h-auto max-h-32 min-h-10 resize-y py-2')}
      />
      <button type="button" disabled={pending || !body.trim()} onClick={send} className={cn(BTN_PRIMARY, 'h-10 px-3')} aria-label="Yuborish">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ create */

function CreateDialog({ manager, assignees, onClose, onCreated }: { manager: boolean; assignees: Person[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [kind, setKind] = useState<IssueKind>('problem');
  const [priority, setPriority] = useState<Priority>('normal');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [anon, setAnon] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [pending, start] = useTransition();
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);

  const stopMic = useCallback(() => {
    if (recRef.current && recRef.current.state !== 'inactive') {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stopMic();
    };
  }, [onClose, stopMic]);

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        if (preview) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(blob));
        setUploading(true);
        try {
          const u = await requestIssueVoiceUploadUrlAction(`voice-note-${Date.now()}.webm`);
          if (u.error || !u.path || !u.url) return void toast.error('Ovozli xabarni yuklab bo‘lmadi');
          const put = await fetch(u.url, { method: 'PUT', headers: { 'Content-Type': 'audio/webm' }, body: blob });
          if (!put.ok) return void toast.error('Ovozli xabarni yuklab bo‘lmadi');
          setVoicePath(u.path);
        } finally {
          setUploading(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast.error('Mikrofonga ruxsat berilmadi');
    }
  }

  const submit = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('title', title);
      fd.set('description', desc);
      fd.set('kind', kind);
      fd.set('priority', priority);
      fd.set('anonymous', kind === 'idea' && anon ? 'on' : 'off');
      if (manager && assignee) fd.set('assignedTo', assignee);
      if (voicePath) fd.set('voiceUrl', voicePath);
      const res = await createIssueAction(undefined, fd);
      if (res?.error || !res?.id) return void toast.error(res?.error === 'invalidInput' ? 'Sarlavha kamida 3 harf bo‘lsin' : errText(res?.error));
      toast.success(kind === 'idea' && anon ? 'Taklif anonim yuborildi' : 'Murojaat yuborildi');
      onCreated(res.id);
    });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3" role="dialog" aria-modal="true" aria-label="Yangi murojaat">
      <button type="button" aria-label="Yopish" onClick={onClose} className="absolute inset-0 bg-black/40 animate-in fade-in-0" />
      <div className={cn(SURFACE_CARD, 'relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden animate-in zoom-in-95 duration-150 motion-reduce:animate-none')}>
        <header className="flex items-center justify-between border-b border-au-line px-5 py-3.5">
          <h2 className="text-base font-bold">Yangi murojaat</h2>
          <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2" aria-label="Yopish">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-3 gap-2">
            {ISSUE_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-au-ctl border p-3 text-left transition-colors',
                  kind === k ? 'border-au-primary bg-au-card ring-2 ring-au-primary/15' : 'border-au-line bg-au-card-2 hover:bg-au-card',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  {KIND_ICON[k]} {KIND_META[k].n}
                </span>
                <span className="text-[11px] leading-tight text-au-muted">{KIND_META[k].hint}</span>
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Qisqacha sarlavha
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder={kind === 'idea' ? 'Masalan: Dars jadvalini Telegramga yuborish' : 'Masalan: 204-xonada proyektor yonmayapti'}
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Batafsil (ixtiyoriy)
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} maxLength={2000} placeholder="Qayerda, qachondan beri, nimaga xalaqit beryapti…" className={cn(INPUT, 'h-auto py-2.5')} />
          </label>
          {kind !== 'idea' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-au-muted">Qanchalik shoshilinch?</span>
              <div className="grid grid-cols-3 gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    aria-pressed={priority === p}
                    className={cn(
                      'flex flex-col items-start rounded-au-ctl border px-3 py-2 text-left transition-colors',
                      priority === p ? 'border-au-primary bg-au-card ring-2 ring-au-primary/15' : 'border-au-line bg-au-card-2 hover:bg-au-card',
                    )}
                  >
                    <span className="text-sm font-bold">{PRIORITY_META[p].n}</span>
                    <span className="text-[11px] text-au-muted">
                      javob {PRIORITY_META[p].respondH} soatda · hal {PRIORITY_META[p].resolveH >= 48 ? `${PRIORITY_META[p].resolveH / 24} kunda` : `${PRIORITY_META[p].resolveH} soatda`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {kind === 'idea' && (
            <label className={cn(SURFACE_INSET, 'flex cursor-pointer items-start gap-3 p-3')}>
              <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="mt-0.5 size-4 accent-au-primary" />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <EyeOff className="size-4" /> Anonim yuborish
                </span>
                <span className="text-xs text-au-muted">Ismingiz hech kimga, rahbariyatga ham ko‘rinmaydi. Javob va natijani o‘zingiz shu yerda ko‘rasiz.</span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={toggleRecord} disabled={uploading} className={cn(BTN_SECONDARY, 'h-9', recording && 'border-au-bad text-au-bad')}>
              {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
              {recording ? 'To‘xtatish' : uploading ? 'Yuklanmoqda…' : 'Ovozli xabar'}
            </button>
            {preview && !recording && <audio controls src={preview} className="h-9 max-w-[240px]" />}
            {preview && !recording && (
              <button type="button" onClick={() => { URL.revokeObjectURL(preview); setPreview(null); setVoicePath(null); }} className="text-xs font-semibold text-au-muted hover:text-au-bad">
                O‘chirish
              </button>
            )}
          </div>
          {manager && (
            <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
              Mas’ul (ixtiyoriy)
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={INPUT}>
                <option value="">— keyin belgilayman —</option>
                {assignees.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!manager && <p className="text-xs text-au-muted">Murojaat rahbariyatga boradi; ular mas’ul belgilaydi. Har bir qadam haqida sizga xabar keladi.</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-au-line bg-au-card-2 px-5 py-3">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Bekor
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={pending || uploading || recording || title.trim().length < 3} onClick={submit}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Yuborish
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ stats & archive */

function StatsView({ stats }: { stats: IssueStats | null }) {
  if (!stats) return <IssuesStats stats={null} />;
  const o = stats.overall;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Muddatida hal" value={o.slaOnTimePct == null ? '—' : `${o.slaOnTimePct}%`} hint="muddatli murojaatlar" tone={o.slaOnTimePct != null && o.slaOnTimePct < 80 ? 'bad' : 'ok'} />
        <Kpi label="Muddat buzilgan" value={o.slaBreached} hint="hozir yoki kech hal" tone={o.slaBreached ? 'bad' : undefined} />
        <Kpi label="O‘rtacha baho" value={o.avgRating == null ? '—' : `${o.avgRating} ★`} hint={`${o.ratedCount} ta baho`} />
        <Kpi label="Qayta ochilgan" value={o.reopenPct == null ? '—' : `${o.reopenPct}%`} hint="muallif rad etgan" tone={(o.reopenPct ?? 0) > 15 ? 'bad' : undefined} />
        <Kpi label="Tasdiq kutilmoqda" value={o.awaitingConfirm} hint="muallif javobi" />
        <Kpi label="Median hal qilish" value={o.medianResolutionDays == null ? '—' : `${o.medianResolutionDays} kun`} />
      </div>
      {stats.byKind.length > 0 && (
        <div className={cn(SURFACE_CARD, 'flex flex-wrap gap-2 p-4')}>
          <span className={cn(CARD_TITLE, 'mr-2')}>Turlar bo‘yicha</span>
          {stats.byKind.map((k) => (
            <span key={k.kind} className={CHIP_NEUTRAL}>
              {KIND_META[k.kind as IssueKind]?.n ?? k.kind}: {k.total} {k.open ? `(${k.open} faol)` : ''}
            </span>
          ))}
        </div>
      )}
      <IssuesStats stats={stats} />
    </div>
  );
}

function ArchiveView({ archive }: { archive: MonthlyIssueArchiveEntry[] }) {
  const [openM, setOpenM] = useState<string | null>(archive[0]?.monthKey ?? null);
  if (!archive.length) return <div className={cn(SURFACE_CARD, 'px-6 py-12 text-center text-sm text-au-muted')}>Arxiv hali bo‘sh — yopilgan murojaatlar 14 kundan keyin shu yerga o‘tadi.</div>;
  return (
    <div className="flex flex-col gap-2">
      {archive.map((m) => (
        <section key={m.monthKey} className={cn(SURFACE_CARD, 'overflow-hidden')}>
          <button type="button" onClick={() => setOpenM(openM === m.monthKey ? null : m.monthKey)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-au-card-2">
            <span className="flex-1 text-sm font-bold capitalize">{m.label}</span>
            <span className="text-xs text-au-muted">
              {m.counts.resolved} ta hal qilindi · {m.counts.raisedInMonth} ta kelgan
            </span>
          </button>
          {openM === m.monthKey && (
            <ul className="divide-y divide-au-line border-t border-au-line">
              {m.issues.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className={CHIP_NEUTRAL}>{KIND_META[i.kind]?.n ?? i.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  <span className="text-xs text-au-muted">
                    {i.reporterName} → {i.assigneeName ?? '—'}
                  </span>
                  {i.rating && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-au-accent-text">
                      <Star className="size-3 fill-current" /> {i.rating}
                    </span>
                  )}
                  {i.resolved_at && <span className="text-xs text-au-muted">{dt(i.resolved_at)}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
