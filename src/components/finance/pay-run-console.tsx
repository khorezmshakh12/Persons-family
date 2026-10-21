'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bot,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  HandCoins,
  History,
  Lock,
  NotebookPen,
  Plus,
  Search,
  BookOpenCheck,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import { ExportButtons } from '@/components/export/export-buttons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  addPayCorrectionAction,
  decideAdvanceAction,
  movePayRunAction,
  payOutstandingAction,
  reviewPayRunWithJevAction,
  savePayRunNoteAction,
  type JevPayVerdict,
} from '@/lib/actions/pay-run';
import { addFinanceEntryAction, deleteFinanceEntryAction, setSalaryMonthAction } from '@/lib/actions/finance';
import { postPayrollAction } from '@/lib/actions/accounting';
import {
  blockers,
  COMPONENT_LABEL,
  drift,
  FLAG_META,
  isRelevant,
  monthLabel,
  PAY_RUN_STATUSES,
  PAY_RUN_STEP,
  REVERSIBLE,
  shiftMonth,
  totals,
  type PayComponent,
  type PayFlag,
  type PayLine,
  type PayRunStatus,
} from '@/lib/pay-run';
import type { AdvanceRequest, MonthPoint, PayRun, PayRunLogEntry, RecentEntry } from '@/lib/pay-run-data';
import { downloadPayslips } from './payslip';
import { MonthBars } from './month-bars';

const som = (n: number) => `${formatUZS(Math.round(n))}`;
const signed = (n: number) => (n === 0 ? '—' : `${n > 0 ? '+' : '−'}${formatUZS(Math.abs(Math.round(n)))}`);
const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 h-9 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
/** Toolbar buttons of the owner design: compact, h-8, text-xs. */
const TB = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-au-ctl px-3 text-xs font-semibold transition disabled:opacity-50 disabled:pointer-events-none';
const TB_GHOST = cn(TB, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');

const ERR: Record<string, string> = {
  blocked: 'Tasdiqlab bo‘lmaydi — avval qizil ogohlantirishlarni hal qiling',
  invalidTransition: 'Bu bosqichga o‘tib bo‘lmaydi (sahifani yangilang)',
  reasonRequired: 'Sababini yozing (kamida 3 belgi)',
  periodLocked: 'Oy qulflangan — tuzatish yozuvi qo‘shing',
  notLocked: 'Oy hali tasdiqlanmagan — yozuvni oddiy tartibda qo‘shing',
  overLimit: 'Bu oy avanslar jami maoshdan oshib ketadi',
  noSalary: 'Bu oy uchun maosh belgilanmagan — avval maoshni kiriting',
  pastMonth: 'O‘tib ketgan oyni tanlab bo‘lmaydi',
  notPaid: 'Oy hali “To‘langan” bosqichida emas',
  nothingOwed: 'Hal qilinadigan qoldiq yo‘q',
  alreadyReversed: 'Bu yozuv allaqachon bekor qilingan',
  systemEntry: 'Bu yozuvni tizim yaratgan — uni o‘z jarayonida o‘zgartiring',
  alreadyDecided: 'Bu so‘rov allaqachon hal qilingan',
  aiDisabled: 'Jev ulanmagan',
  aiFailed: 'Jev javob bermadi — keyinroq urinib ko‘ring',
  forbidden: 'Ruxsat yo‘q',
  invalidInput: 'Ma’lumotni tekshiring',
};
const errText = (c: string) => ERR[c] ?? 'Saqlab bo‘lmadi, qayta urinib ko‘ring';
const KIND_UZ: Record<string, string> = { salary: 'Oylik', advance: 'Avans', penalty: 'Jarima', adjustment: 'Tuzatish' };
const hhmm = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit' });
/** Undo window on the success toast of a payment / advance. */
const UNDO_MS = 15000;

type Filter = 'all' | 'settled' | 'owed' | 'over' | 'flags' | 'jev' | `flag:${PayFlag}`;
type SortKey = 'name' | 'base' | 'adj' | 'payable' | 'paid' | 'remaining';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** One line's place in the month: still owed, overpaid (an advance beyond
 * the month's pay — held back from next month), fully paid, or not started. */
const owedOf = (l: PayLine) => Math.max(0, l.remaining);
const overOf = (l: PayLine) => Math.max(0, -l.remaining);
const isSettled = (l: PayLine) => l.remaining === 0 && l.paid > 0;
const adjOf = (l: PayLine) => l.kpi + l.bonuses + l.deductions;

export function PayRunConsole({
  period,
  run,
  lines: allLines,
  log,
  advances,
  history,
  roleNames,
  recent = [],
}: {
  period: string;
  run: PayRun;
  lines: PayLine[];
  log: PayRunLogEntry[];
  advances: AdvanceRequest[];
  history: MonthPoint[];
  roleNames: Record<string, string>;
  /** My hand-made ledger rows of the last 24h — "Oxirgi amallar" undo list. */
  recent?: RecentEntry[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [showRecent, setShowRecent] = useState(false);

  // Takes back a payment / advance entered by mistake (deletes the ledger
  // row; the database still refuses it once the month is locked).
  const undo = (entryId: string, what: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set('entryId', entryId);
      const res = await deleteFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      toast.success(`Qaytarildi: ${what}`);
      setShowRecent(false);
      router.refresh();
    });
  const lines = useMemo(() => allLines.filter(isRelevant), [allLines]);
  const sum = totals(lines);
  const block = blockers(lines);
  const locked = run.status === 'approved' || run.status === 'paid';
  const drifted = drift(lines, run.snapshot);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ by: SortKey; dir: 1 | -1 }>({ by: 'payable', dir: -1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [jev, setJev] = useState<Record<string, JevPayVerdict>>({});
  const [jevOpen, setJevOpen] = useState(false);
  const [back, setBack] = useState<PayRunStatus | null>(null);
  const [reason, setReason] = useState('');
  const [giveFor, setGiveFor] = useState<string | null>(null);
  const pendingAdv = advances.filter((a) => a.status === 'pending');

  const owed = lines.reduce((t, l) => t + owedOf(l), 0);
  const owedCount = lines.filter((l) => owedOf(l) > 0).length;
  const overTotal = lines.reduce((t, l) => t + overOf(l), 0);
  const overCount = lines.filter((l) => overOf(l) > 0).length;
  const advTotal = lines.reduce((t, l) => t + l.advances, 0);
  const advCount = lines.filter((l) => l.advances > 0).length;
  const settledCount = lines.filter(isSettled).length;
  const flaggedCount = lines.filter((l) => l.flags.length > 0).length;
  const paidPct = sum.payable > 0 ? Math.min(100, Math.round((sum.paid / sum.payable) * 100)) : 0;

  const flagGroups = useMemo(() => {
    const m = new Map<PayFlag, PayLine[]>();
    for (const l of lines) for (const f of l.flags) m.set(f, [...(m.get(f) ?? []), l]);
    return [...m.entries()].sort((a, b) => Number(FLAG_META[b[0]].blocking) - Number(FLAG_META[a[0]].blocking));
  }, [lines]);

  const roles = useMemo(() => [...new Set(lines.map((l) => l.role))], [lines]);

  const shown = lines
    .filter((l) => {
      const ql = q.trim().toLowerCase();
      if (ql && !l.name.toLowerCase().includes(ql) && !(roleNames[l.role] ?? l.role).toLowerCase().includes(ql)) return false;
      if (role !== 'all' && l.role !== role) return false;
      if (filter === 'settled') return isSettled(l);
      if (filter === 'owed') return owedOf(l) > 0;
      if (filter === 'over') return overOf(l) > 0 || l.advances > 0;
      if (filter === 'flags') return l.flags.length > 0;
      if (filter === 'jev') return jev[l.staffId]?.verdict === 'check';
      if (filter.startsWith('flag:')) return l.flags.includes(filter.slice(5) as PayFlag);
      return true;
    })
    .sort((a, b) => {
      if (sort.by === 'name') return a.name.localeCompare(b.name) * sort.dir;
      const v = (l: PayLine): number => (sort.by === 'adj' ? adjOf(l) : l[sort.by as Exclude<SortKey, 'name' | 'adj'>]);
      return (v(a) - v(b)) * sort.dir;
    });
  // The table footer "Jami" totals the rows actually shown, so it always
  // matches the visible list under a search/filter (the KPI cards keep the
  // whole-month grand total via `sum`).
  const shownTotals = totals(shown);
  const shownOwed = shown.reduce((t, l) => t + owedOf(l), 0);
  const shownOver = shown.reduce((t, l) => t + overOf(l), 0);
  const open = lines.find((l) => l.staffId === openId) ?? null;
  const idx = PAY_RUN_STATUSES.indexOf(run.status);
  const next = PAY_RUN_STATUSES[idx + 1] as PayRunStatus | undefined;
  const prev = PAY_RUN_STATUSES[idx - 1] as PayRunStatus | undefined;

  const move = (to: PayRunStatus, why = '') =>
    start(async () => {
      const res = await movePayRunAction({ period, to, reason: why });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setBack(null);
      setReason('');
      toast.success(
        to === 'paid'
          ? `To‘lovlar qayd etildi${res.paidCount ? ` (${res.paidCount} xodim)` : ''}${res.carried ? ` · ${res.carried} xodimning ortiqcha to‘lovi keyingi oydan ushlanadi` : ''}`
          : to === 'approved' && idx < 2
            ? 'Oylik tasdiqlandi — oy qulflandi'
            : `Bosqich: ${PAY_RUN_STEP[to].n}`,
      );
      router.refresh();
    });

  // A correction after payment leaves money owed (paid by the run) or an
  // overpayment that differs from what is already carried into next month.
  const overNeg = lines.reduce((t, l) => t + Math.min(0, l.remaining), 0);
  const unsettled = run.status === 'paid' && (owed > 0 || overNeg !== run.carried);
  const payOutstanding = () =>
    start(async () => {
      const res = await payOutstandingAction({ period });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(
        [
          res.paidCount ? `${res.paidCount} xodimga qoldiq to‘landi` : '',
          res.carried ? `${res.carried} xodimning ortiqcha to‘lovi keyingi oydan ushlanadi` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'Hisob-kitob yangilandi',
      );
      router.refresh();
    });

  // One person's remainder, paid from the row while the month is open (a
  // locked month is paid by the run itself — the database refuses writes).
  const quickPay = (l: PayLine) =>
    start(async () => {
      const fd = new FormData();
      fd.set('staffId', l.staffId);
      fd.set('title', `${monthLabel(period)} oyligi`);
      fd.set('amount', String(owedOf(l)));
      fd.set('kind', 'salary');
      fd.set('period', period);
      const res = await addFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      const what = `${l.name} · ${som(owedOf(l))} so‘m`;
      toast.success(`${l.name}: ${som(owedOf(l))} so‘m to‘landi`, {
        duration: UNDO_MS,
        action: res?.entryId ? { label: 'Qaytarish', onClick: () => undo(res.entryId!, what) } : undefined,
      });
      router.refresh();
    });

  const askJev = () =>
    start(async () => {
      const res = await reviewPayRunWithJevAction(period);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setJev(Object.fromEntries(res.verdicts.map((v) => [v.staffId, v])));
      setJevOpen(true);
      const n = res.verdicts.filter((v) => v.verdict === 'check').length;
      toast.success(n ? `Jev ${n} ta qatorni tekshirishni tavsiya qildi` : 'Jev: hammasi odatdagidek');
      if (n) setFilter('jev');
    });

  const decide = (a: AdvanceRequest, approve: boolean, note = '', targetPeriod?: string) =>
    start(async () => {
      const res = await decideAdvanceAction({ id: a.id, approve, note, targetPeriod });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(
        approve
          ? `Avans tasdiqlandi: ${som(a.amount)} so‘m${targetPeriod ? ` · ${monthLabel(targetPeriod)}dan ushlanadi` : ''}`
          : 'Avans rad etildi',
      );
      router.refresh();
    });

  const jevChecks = Object.values(jev).filter((v) => v.verdict === 'check').length;
  const sortTh = (by: SortKey, label: string, right = true) => (
    <th
      data-sort={by}
      onClick={() => setSort((s) => ({ by, dir: s.by === by ? (s.dir === 1 ? -1 : 1) : by === 'name' ? 1 : -1 }))}
      className={cn('px-3 py-2.5', right && 'text-right', sort.by === by && 'is-sorted')}
    >
      {label} <span className="fp-sort-arrow">{sort.by === by ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span>
    </th>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Period, toolbar, stepper, KPI cards */}
      <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-4 p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/finance?period=${shiftMonth(period, -1)}`}
              aria-label="Oldingi oy"
              className="inline-flex size-8 items-center justify-center rounded-au-ctl border border-au-line bg-au-card-2 text-au-ink transition hover:bg-au-accent-soft"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <div className="flex flex-col px-1">
              <span className="text-[11px] font-bold tracking-wider text-au-muted uppercase">Moliya · Oylik va Avanslar</span>
              <h1 className="text-xl font-bold tracking-tight text-au-ink sm:text-2xl">{monthLabel(period)}</h1>
            </div>
            <Link
              href={`/finance?period=${shiftMonth(period, 1)}`}
              aria-label="Keyingi oy"
              className="inline-flex size-8 items-center justify-center rounded-au-ctl border border-au-line bg-au-card-2 text-au-ink transition hover:bg-au-accent-soft"
            >
              <ChevronRight className="size-4" />
            </Link>
            <div className="ml-1 flex flex-wrap items-center gap-1.5">
              {locked ? (
                <span className="fp-chip fp-chip-accent">
                  <Lock className="size-3" /> Oy qulflangan
                </span>
              ) : (
                <span className="fp-chip fp-chip-neutral">Ochiq davr</span>
              )}
              {overCount > 0 && (
                <span className="fp-chip fp-chip-info">
                  {overCount} xodimda ortiqcha ({som(overTotal)})
                </span>
              )}
              {run.approved_by_name && <span className="fp-chip fp-chip-neutral">Tasdiqladi: {run.approved_by_name}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {next === 'paid' && (
              <button className={cn(TB, 'bg-au-ok px-3.5 text-white shadow-xs hover:opacity-90')} disabled={busy} onClick={() => move('paid')}>
                <Banknote className="size-3.5" /> Qoldiqni to‘lash ({som(owed)})
              </button>
            )}
            {unsettled && (
              <button
                className={cn(TB, 'bg-au-ok px-3.5 text-white shadow-xs hover:opacity-90')}
                disabled={busy}
                onClick={payOutstanding}
                title="Tuzatishlardan keyin: qarz to‘lanadi, ortiqcha to‘lov keyingi oydan ushlanadi"
              >
                <Banknote className="size-3.5" /> Qoldiqni hal qilish{owed > 0 ? ` (${som(owed)})` : ''}
              </button>
            )}
            <button className={cn(TB, 'border border-au-info/40 bg-au-info-soft text-au-info hover:opacity-90')} disabled={busy} onClick={() => setGiveFor('')}>
              <HandCoins className="size-3.5" /> Avans berish
            </button>
            {next && next !== 'paid' && (
              <button
                className={cn(TB, 'bg-au-accent px-3.5 text-au-accent-ink shadow-xs hover:opacity-90')}
                disabled={busy || (next === 'approved' && block.length > 0)}
                onClick={() => move(next)}
                title={next === 'approved' && block.length ? 'Avval qizil ogohlantirishlarni hal qiling' : undefined}
              >
                {next === 'review' ? <ArrowRight className="size-3.5" /> : <BadgeCheck className="size-3.5" />}
                {next === 'review' ? 'Tekshirishga o‘tkazish' : 'Tasdiqlash va qulflash'}
              </button>
            )}
            {prev && !back && (
              <button className={TB_GHOST} disabled={busy} onClick={() => setBack(prev)}>
                <Undo2 className="size-3.5" /> {run.status === 'paid' ? 'To‘lovni bekor qilish' : run.status === 'approved' ? 'Qulfni ochish' : 'Orqaga'}
              </button>
            )}
            {recent.length > 0 && (
              <div className="relative">
                <button className={TB_GHOST} disabled={busy} aria-expanded={showRecent} onClick={() => setShowRecent((v) => !v)}>
                  <History className="size-3.5" /> Oxirgi amallar ({recent.length})
                </button>
                {showRecent && (
                  <div className="absolute top-full right-0 z-30 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-au-card border border-au-line bg-au-card p-2 shadow-lg">
                    <p className="px-2 pb-1.5 text-[11px] text-au-muted">So‘nggi 24 soatda qo‘lda kiritganlaringiz. Xato bo‘lsa — qaytaring.</p>
                    <ul className="flex flex-col">
                      {recent.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-au-card-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-au-ink">{r.staffName}</div>
                            <div className="truncate text-[11px] text-au-muted">
                              {KIND_UZ[r.kind] ?? r.kind} · {r.title} · {hhmm.format(new Date(r.at))}
                            </div>
                          </div>
                          <span className="shrink-0 text-xs font-bold text-au-ink tabular-nums">{som(r.amount)}</span>
                          <button
                            className="shrink-0 rounded-au-ctl border border-au-line px-2 py-1 text-[11px] font-semibold text-au-bad hover:bg-au-bad-soft"
                            disabled={busy}
                            onClick={() => undo(r.id, `${r.staffName} · ${som(Math.abs(r.amount))} so‘m`)}
                          >
                            Qaytarish
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <button className={TB_GHOST} disabled={busy} onClick={askJev}>
              <Bot className="size-3.5" /> Jev tahlili
            </button>
            {locked && (
              <button
                className={TB_GHOST}
                disabled={busy}
                title="Buxgalteriya jurnaliga ish haqi yozuvlarini tasdiqlangan summalar bilan yozadi (qayta bosilsa almashtiradi)"
                onClick={() =>
                  start(async () => {
                    // The server books the approved snapshot itself.
                    const res = await postPayrollAction(period.slice(0, 7));
                    if (res.error !== undefined) return void toast.error(errText(res.error));
                    toast.success(`Buxgalteriyaga o‘tkazildi (${res.count ?? 0} yozuv)`);
                  })
                }
              >
                <BookOpenCheck className="size-3.5" /> Kassaga o‘tkazish
              </button>
            )}
            <button className={TB_GHOST} disabled={busy || !lines.length} onClick={() => downloadPayslips(lines, period, PAY_RUN_STEP[run.status].n)}>
              <FileDown className="size-3.5" /> Kvitansiya PDF
            </button>
            <ExportButtons
              filename={`oylik-${period.slice(0, 7)}`}
              columns={[
                { header: 'Xodim', key: 'name' },
                { header: 'Maosh', key: 'base' },
                { header: 'KPI', key: 'kpi' },
                { header: 'Bonus', key: 'bonuses' },
                { header: 'Ushlanma', key: 'deductions' },
                { header: 'To‘lanadi', key: 'payable' },
                { header: 'To‘langan', key: 'paid' },
                { header: 'Qoldiq', key: 'remaining' },
              ]}
              rows={lines.map((l) => ({ ...l }))}
            />
          </div>
        </div>

        {/* 4-stage stepper */}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_RUN_STATUSES.map((s, i) => {
            const state = i < idx || (run.status === 'paid' && i === idx) ? 'done' : i === idx ? 'now' : 'todo';
            return (
              <li
                key={s}
                style={{ ['--i' as string]: i }}
                className={cn(
                  'ms-rise relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-au-ctl border px-3 py-2.5',
                  state === 'now' ? 'border-au-accent bg-au-accent-soft' : state === 'done' ? 'border-au-line bg-au-ok-soft/50' : 'border-au-line bg-au-card-2',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-au-muted">
                  {state === 'done' ? <CheckCircle2 className="size-3.5 text-au-ok" /> : <span className="grid size-4 place-items-center rounded-full bg-au-card text-[10px]">{i + 1}</span>}
                  {i + 1}-bosqich
                </span>
                <span className={cn('text-sm font-bold', state === 'todo' ? 'text-au-muted' : 'text-au-ink')}>{PAY_RUN_STEP[s].n}</span>
                <span className="truncate text-[11px] leading-4 text-au-muted">{PAY_RUN_STEP[s].hint}</span>
                {state === 'now' && <i className="ms-fill absolute inset-x-0 bottom-0 h-0.5 origin-left bg-au-accent" />}
              </li>
            );
          })}
        </ol>

        {back && (
          <div className="ms-pop-in flex flex-col gap-2 rounded-au-ctl border border-au-bad/30 bg-au-bad-soft/40 p-3">
            <span className="text-sm font-semibold text-au-ink">
              {run.status === 'paid'
                ? 'To‘lov qaydlari o‘chiriladi va oy “Tasdiqlangan” holatiga qaytadi.'
                : run.status === 'approved'
                  ? 'Oy qulfi ochiladi — yozuvlarni yana o‘zgartirish mumkin bo‘ladi.'
                  : 'Oldingi bosqichga qaytariladi.'}{' '}
              Sababi jurnalga yoziladi.
            </span>
            <div className="flex flex-wrap gap-2">
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sabab…" className={cn(INPUT, 'h-9 min-w-60 flex-1')} />
              <button className={cn(BTN, 'bg-au-bad text-white hover:opacity-90')} disabled={busy || reason.trim().length < 3} onClick={() => move(back, reason.trim())}>
                Tasdiqlash
              </button>
              <button className={BTN_GHOST} onClick={() => setBack(null)}>
                Bekor
              </button>
            </div>
          </div>
        )}

        {jevOpen && (
          <div className="ms-pop-in flex flex-wrap items-start justify-between gap-3 rounded-au-ctl border border-au-accent bg-au-accent-soft/40 p-3.5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-au-accent text-au-accent-ink">
                <Bot className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-bold text-au-ink">Jev xulosasi</span>
                <p className="text-xs leading-relaxed text-au-muted">
                  • <b>To‘lanishi kerak:</b> {owedCount} xodimga jami <b className="text-au-ink">{som(owed)} so‘m</b>.<br />
                  • <b>Avanslar:</b> {advCount} xodimga <b className="text-au-ink">{som(advTotal)} so‘m</b>
                  {overCount > 0 ? <>, shundan {overCount} xodimda {som(overTotal)} so‘m ortiqcha (keyingi oydan ushlanadi)</> : null}.<br />
                  • <b>Tekshiruv:</b> {jevChecks ? `Jev ${jevChecks} ta qatorni tekshirishni tavsiya qildi.` : 'Hammasi odatdagidek.'}
                  {flaggedCount > 0 && ` ${flaggedCount} xodimda ogohlantirish bor.`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {jevChecks > 0 && (
                <button className={cn(TB, 'bg-au-accent text-au-accent-ink')} onClick={() => setFilter('jev')}>
                  Ko‘rsatish ({jevChecks})
                </button>
              )}
              <button className={TB_GHOST} onClick={() => setJevOpen(false)}>
                Yopish
              </button>
            </div>
          </div>
        )}

        {/* 4 KPI cards — each one is also a filter */}
        <div className="fp-kpi-grid">
          <KpiCard on={filter === 'all'} onClick={() => setFilter('all')} title="1. Jami hisoblangan fond" chip={<span className="fp-chip fp-chip-neutral">{lines.length} xodim</span>} value={som(sum.payable)} tone="text-au-ink">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-au-muted">
              <span>
                Maosh: <b className="text-au-ink">{som(sum.base)}</b>
              </span>
              <span>·</span>
              <span className="font-semibold text-au-ok">Bonus: {signed(sum.kpi + sum.bonuses)}</span>
              <span>·</span>
              <span className="font-semibold text-au-bad">Ushlanma: {signed(sum.deductions)}</span>
            </div>
          </KpiCard>
          <KpiCard on={filter === 'settled'} onClick={() => setFilter('settled')} title="2. Jami to‘lab berildi" chip={<span className="fp-chip fp-chip-ok">{paidPct}% bajarildi</span>} value={som(sum.paid)} tone="text-au-ok">
            <div className="fp-kpi-bar">
              <i style={{ width: `${paidPct}%`, background: 'var(--au-ok)' }} />
            </div>
          </KpiCard>
          <KpiCard on={filter === 'owed'} onClick={() => setFilter('owed')} title="3. To‘lanishi kerak (Qoldiq)" chip={<span className="fp-chip fp-chip-accent">{owedCount} xodimga</span>} value={som(owed)} tone="text-au-accent-text">
            <span className="truncate text-[11px] text-au-muted">
              {owedCount > 0
                ? lines
                    .filter((l) => owedOf(l) > 0)
                    .sort((a, b) => owedOf(b) - owedOf(a))
                    .slice(0, 3)
                    .map((l) => `${l.name.split(' ')[0]} (${som(owedOf(l))})`)
                    .join(' · ')
                : 'Hech kim oldida qarz yo‘q'}
            </span>
          </KpiCard>
          <KpiCard on={filter === 'over'} onClick={() => setFilter('over')} title="4. Berilgan avanslar" chip={<span className="fp-chip fp-chip-info">{advCount} xodimda</span>} value={som(advTotal)} tone="text-au-info">
            <span className="truncate text-[11px] text-au-muted">
              {overCount > 0 ? `Ortiqcha ${som(overTotal)} — keyingi oy oyligidan ushlanadi` : 'Shu oy oyligidan ushlanadi'}
            </span>
          </KpiCard>
        </div>
      </section>

      {drifted.length > 0 && (
        <Banner tone="info" icon={<History className="size-4" />}>
          Tasdiqlangandan keyin {drifted.length} xodimning summasi o‘zgardi (tuzatish yozuvlari):{' '}
          {drifted.map((d) => `${lines.find((l) => l.staffId === d.staffId)?.name}: ${som(d.was)} → ${som(d.now)}`).join('; ')}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Staff table */}
        <section className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col gap-3 p-4')} style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-au-muted" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Xodim yoki lavozim izlash..."
                  className="h-8 w-56 rounded-au-ctl border border-au-line bg-au-card-2 pr-2.5 pl-8 text-xs text-au-ink placeholder:text-au-muted focus:border-au-accent focus:outline-none"
                />
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 rounded-au-ctl border border-au-line bg-au-card-2 px-2.5 text-xs font-medium text-au-ink focus:border-au-accent focus:outline-none"
              >
                <option value="all">Barcha lavozimlar ({lines.length})</option>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleNames[r] ?? r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['all', `Hammasi (${lines.length})`],
                  ['owed', `To‘lanishi kerak (${owedCount})`],
                  ['over', `Avans olganlar (${lines.filter((l) => overOf(l) > 0 || l.advances > 0).length})`],
                  ['settled', `✓ To‘liq yopilgan (${settledCount})`],
                  ...(flaggedCount ? [['flags', `Tekshirish (${flaggedCount})`]] : []),
                  ...(Object.keys(jev).length ? [['jev', `Jev (${jevChecks})`]] : []),
                ] as [Filter, string][]
              ).map(([k, n]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn('h-8 rounded-full px-3 text-xs font-semibold transition', filter === k ? 'bg-au-ink text-au-card shadow-sm' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-au-line">
            <table className="fp-table w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-au-line bg-au-card-2 text-left text-[11px] font-bold tracking-wider text-au-muted uppercase">
                  {sortTh('name', 'Xodim', false)}
                  {sortTh('base', 'Asosiy maosh')}
                  {sortTh('adj', 'Bonus / Jarima')}
                  {sortTh('payable', 'Jami hisoblangan')}
                  {sortTh('paid', 'To‘langan')}
                  {sortTh('remaining', 'Qoldiq / Avans')}
                  <th className="px-3 py-2.5">Holat va tezkor amal</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => {
                  const plus = l.kpi + l.bonuses;
                  return (
                    <tr
                      key={l.staffId}
                      onClick={() => setOpenId(l.staffId)}
                      style={{ ['--i' as string]: Math.min(i, 15) }}
                      className="ms-rise cursor-pointer border-t border-au-line"
                    >
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="fp-avatar">{initials(l.name)}</span>
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-semibold text-au-ink">{l.name}</span>
                            <span className="truncate text-[11px] text-au-muted">{roleNames[l.role] ?? l.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        {l.base ? som(l.base) : <span className="text-au-bad">—</span>}
                        {l.delta !== null && Math.abs(l.delta) >= 0.05 && (
                          <span className={cn('ml-1 text-[10px] font-semibold', l.delta > 0 ? 'text-au-ok' : 'text-au-bad')}>
                            {l.delta > 0 ? '▲' : '▼'}
                            {Math.round(Math.abs(l.delta) * 100)}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          {plus !== 0 && <span className={cn('font-semibold', plus > 0 ? 'text-au-ok' : 'text-au-bad')}>{signed(plus)}</span>}
                          {l.deductions < 0 && <span className={cn('text-au-bad', plus !== 0 ? 'text-[11px]' : 'font-semibold')}>{signed(l.deductions)}</span>}
                          {plus === 0 && l.deductions === 0 && <span className="text-au-muted">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-bold whitespace-nowrap text-au-ink tabular-nums">{som(l.payable)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          <span className="font-semibold text-au-ink">{som(l.paid)}</span>
                          {l.advances > 0 ? (
                            <span className="text-[10px] text-au-info">shundan avans: {som(l.advances)}</span>
                          ) : (
                            <span className="text-[10px] text-au-muted">{l.payments.length} ta to‘lov</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                        <div className="flex flex-col items-end leading-tight">
                          {owedOf(l) > 0 ? (
                            <>
                              <span className="font-bold text-au-accent-text">{som(owedOf(l))}</span>
                              <span className="text-[10px] text-au-muted">To‘lanishi kerak</span>
                            </>
                          ) : overOf(l) > 0 ? (
                            <>
                              <span className="font-bold text-au-info">+{som(overOf(l))}</span>
                              <span className="text-[10px] text-au-info">Ortiqcha / avans</span>
                            </>
                          ) : (
                            <>
                              <span className={cn('font-semibold', l.paid > 0 ? 'text-au-ok' : 'text-au-muted')}>0</span>
                              <span className="text-[10px] text-au-muted">{l.paid > 0 ? 'To‘liq yopilgan' : 'To‘lov yo‘q'}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1">
                            {jev[l.staffId] && (
                              <span className={cn('fp-chip', jev[l.staffId].verdict === 'check' ? 'fp-chip-bad' : 'fp-chip-ok')} title={`Jev ishonchi ${Math.round(jev[l.staffId].confidence * 100)}%`}>
                                <Bot className="size-3" /> {jev[l.staffId].verdict === 'check' ? 'Tekshiring' : 'OK'}
                              </span>
                            )}
                            {l.flags.slice(0, 2).map((f) => (
                              <span key={f} className={cn('fp-chip', FLAG_META[f].blocking ? 'fp-chip-bad' : 'fp-chip-accent')}>
                                {FLAG_META[f].n}
                              </span>
                            ))}
                            {l.flags.length > 2 && <span className="fp-chip fp-chip-neutral">+{l.flags.length - 2}</span>}
                            {!l.flags.length &&
                              (owedOf(l) > 0 ? (
                                <span className="fp-chip fp-chip-accent">To‘lov kutilmoqda</span>
                              ) : overOf(l) > 0 ? (
                                <span className="fp-chip fp-chip-info">Avans berilgan</span>
                              ) : l.paid > 0 ? (
                                <span className="fp-chip fp-chip-ok">✓ To‘langan</span>
                              ) : (
                                <span className="fp-chip fp-chip-neutral">Tayyor</span>
                              ))}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {!locked && owedOf(l) > 0 ? (
                              <button
                                disabled={busy}
                                onClick={() => quickPay(l)}
                                title="Qoldiqni 1-klikda to‘lash"
                                className="inline-flex items-center gap-1 rounded-md bg-au-ok px-2.5 py-1 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                              >
                                ✓ To‘lash
                              </button>
                            ) : (
                              <button
                                disabled={busy}
                                onClick={() => setGiveFor(l.staffId)}
                                title="Xodimga avans berish"
                                className="inline-flex items-center gap-1 rounded-md border border-au-info/30 bg-au-info-soft px-2 py-1 text-[11px] font-semibold text-au-info hover:opacity-90 disabled:opacity-50"
                              >
                                + Avans
                              </button>
                            )}
                            <button
                              onClick={() => setOpenId(l.staffId)}
                              className="inline-flex items-center rounded-md border border-au-line bg-au-card px-2 py-1 text-[11px] font-semibold text-au-ink hover:bg-au-card-2"
                            >
                              Batafsil
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-au-line bg-au-card-2 font-bold">
                  <td className="px-3 py-3">Jami ({shown.length} xodim)</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{som(shownTotals.base)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                    <span className={shownTotals.kpi + shownTotals.bonuses + shownTotals.deductions >= 0 ? 'text-au-ok' : 'text-au-bad'}>
                      {signed(shownTotals.kpi + shownTotals.bonuses + shownTotals.deductions)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">{som(shownTotals.payable)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap text-au-ok tabular-nums">{som(shownTotals.paid)}</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                    <div className="flex flex-col items-end leading-tight">
                      <span className="text-au-accent-text">Qoldiq: {som(shownOwed)}</span>
                      {shownOver > 0 && <span className="text-[11px] font-semibold text-au-info">Ortiqcha: +{som(shownOver)}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className="fp-chip fp-chip-ok">
                      {shownTotals.payable > 0 ? Math.min(100, Math.round((shownTotals.paid / shownTotals.payable) * 100)) : 0}% to‘langan
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
            {!shown.length && (
              <p className="p-6 text-center text-sm text-au-muted">
                Tanlangan filtr bo‘yicha xodimlar topilmadi.{' '}
                <button
                  className="font-semibold text-au-accent-text underline"
                  onClick={() => {
                    setFilter('all');
                    setRole('all');
                    setQ('');
                  }}
                >
                  Filtrlarni tozalash
                </button>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-au-muted">
            <span>
              Qatordagi <b>«✓ To‘lash»</b> yoki <b>«+ Avans»</b> 1 klikda ishlaydi. Xodim ustiga bosib batafsil oynani oching.
            </span>
            <span className="font-mono">Valyuta: UZS (so‘m)</span>
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title="Tekshirish va tasdiqlash" right={<span className="text-[11px] text-au-muted">1 klikda ko‘rish</span>}>
            {flagGroups.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-au-ok/30 bg-au-ok-soft p-3 text-xs font-semibold text-au-ok">
                <CheckCircle2 className="size-4 shrink-0" /> Barcha tekshiruvlar o‘tdi — oyni qulflashga tayyor.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {flagGroups.map(([f, ls]) => {
                  const key = `flag:${f}` as Filter;
                  return (
                    <li key={f} className={cn('rounded-lg border p-2.5 transition', filter === key ? 'border-au-accent bg-au-accent-soft/40' : 'border-au-line bg-au-card-2/50')}>
                      <button onClick={() => setFilter(filter === key ? 'all' : key)} className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-au-ink">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className={cn('size-3.5 shrink-0', FLAG_META[f].blocking ? 'text-au-bad' : 'text-au-accent-text')} />
                          {FLAG_META[f].n}
                        </span>
                        <span className={cn('fp-chip', FLAG_META[f].blocking ? 'fp-chip-bad' : 'fp-chip-accent')}>{ls.length}</span>
                      </button>
                      <div className="mt-1">
                        {ls.slice(0, 6).map((l) => (
                          <div key={l.staffId} className="mt-1.5 flex items-center justify-between gap-2 border-t border-au-line/60 pt-1.5">
                            <span className="truncate text-[11px] font-medium text-au-ink">
                              {l.name}
                              {f === 'variance' && l.delta !== null ? ` (${l.delta > 0 ? '+' : ''}${Math.round(l.delta * 100)}%)` : ''}
                            </span>
                            <button
                              onClick={() => setOpenId(l.staffId)}
                              className="shrink-0 rounded bg-au-accent px-2 py-0.5 text-[10px] font-semibold text-au-accent-ink hover:opacity-90"
                            >
                              Ochish
                            </button>
                          </div>
                        ))}
                        {ls.length > 6 && <p className="mt-1 text-[11px] text-au-muted">+{ls.length - 6} ta</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Avans so‘rovlari" right={<span className={cn('fp-chip', pendingAdv.length ? 'fp-chip-info' : 'fp-chip-neutral')}>{pendingAdv.length}</span>}>
            {pendingAdv.length === 0 ? (
              <p className="text-xs text-au-muted">Kutilayotgan avans so‘rovlari yo‘q.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {pendingAdv.map((a) => (
                  <AdvanceItem key={a.id} a={a} busy={busy} onDecide={decide} />
                ))}
              </ul>
            )}
            <button
              onClick={() => setGiveFor('')}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-au-ctl border border-dashed border-au-line bg-au-card-2 px-3 text-xs font-semibold text-au-ink hover:border-au-accent"
            >
              <HandCoins className="size-3.5" /> Xodimga avans berish
            </button>
            {advances.some((a) => a.status !== 'pending') && (
              <details className="text-xs text-au-muted">
                <summary className="cursor-pointer font-semibold">Oxirgi qarorlar</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {advances
                    .filter((a) => a.status !== 'pending')
                    .slice(0, 8)
                    .map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="truncate">{a.staff_name}</span>
                        <span className={cn('shrink-0', a.status === 'approved' ? 'text-au-ok' : 'text-au-muted')}>
                          {som(a.amount)} · {a.status === 'approved' ? 'tasdiqlangan' : a.status === 'rejected' ? 'rad etilgan' : 'bekor qilingan'}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="12 oy: fond va to‘lovlar">
            <MonthBars points={history} current={period} />
          </Panel>

          <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')}>
            <NotePanel period={period} initial={run.note ?? ''} />
            <div className="flex flex-col gap-1.5 border-t border-au-line pt-2.5">
              <span className="text-xs font-bold tracking-wider text-au-muted uppercase">Jurnal (oxirgi amallar)</span>
              {log.length === 0 ? (
                <p className="text-xs text-au-muted">Hali harakat yo‘q</p>
              ) : (
                <ol className="flex max-h-48 flex-col gap-2 overflow-y-auto pr-1 text-xs">
                  {log.slice(0, 12).map((e) => (
                    <li key={e.id} className="flex flex-col border-l-2 border-au-accent/60 py-0.5 pl-2.5">
                      <span className="font-semibold text-au-ink">{logLabel(e)}</span>
                      <span className="text-[11px] text-au-muted">
                        {e.actor ?? 'Tizim'} · {e.at.slice(0, 16).replace('T', ' ')}
                        {typeof e.detail.reason === 'string' && e.detail.reason ? ` · “${e.detail.reason}”` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </aside>
      </div>

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        {open && (
          <LineDrawer
            line={open}
            period={period}
            locked={locked}
            role={roleNames[open.role] ?? open.role}
            jev={jev[open.staffId]}
            status={PAY_RUN_STEP[run.status].n}
            onDone={() => router.refresh()}
          />
        )}
      </Sheet>

      <GiveAdvanceDialog
        open={giveFor !== null}
        onClose={() => setGiveFor(null)}
        lines={lines}
        staffId={giveFor ?? ''}
        period={period}
        locked={locked}
        onDone={() => router.refresh()}
        onUndo={undo}
      />
    </div>
  );
}

function KpiCard({
  on,
  onClick,
  title,
  chip,
  value,
  tone,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title: string;
  chip: ReactNode;
  value: string;
  tone: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={cn('fp-kpi-card', on && 'is-active')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-au-muted">{title}</span>
        {chip}
      </div>
      {/* Full number, never truncated: wraps on narrow cards instead. */}
      <span className={cn('text-xl leading-tight font-bold break-words tabular-nums sm:text-2xl', tone)}>
        <CountUp value={value} /> <small className="text-xs font-normal text-au-muted">so‘m</small>
      </span>
      {children}
    </button>
  );
}

/** CEO hands an advance directly (not from a request): an 'advance' payment
 * row in the chosen month. A locked month refuses it, so a later month is
 * offered then. */
function GiveAdvanceDialog({
  open,
  onClose,
  lines,
  staffId,
  period,
  locked,
  onDone,
  onUndo,
}: {
  open: boolean;
  onClose: () => void;
  lines: PayLine[];
  staffId: string;
  period: string;
  locked: boolean;
  onDone: () => void;
  onUndo: (entryId: string, what: string) => void;
}) {
  const [busy, start] = useTransition();
  const [who, setWho] = useState(staffId);
  const [amount, setAmount] = useState('');
  const [why, setWhy] = useState('');
  const months = [0, 1, 2].map((n) => shiftMonth(period, n)).filter((m) => !(locked && m === period));
  const [per, setPer] = useState(months[0]);
  const [seen, setSeen] = useState(open);
  // Re-seed the form each time the dialog opens (a row's "+ Avans" picks
  // that person).
  if (open !== seen) {
    setSeen(open);
    if (open) {
      setWho(staffId);
      setAmount('');
      setWhy('');
      setPer(months[0]);
    }
  }
  const num = Number(amount.replace(/\s/g, '').replace(',', '.'));
  const line = lines.find((l) => l.staffId === who);

  const save = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('staffId', who);
      fd.set('title', why.trim() || 'Avans');
      fd.set('amount', String(num));
      fd.set('kind', 'advance');
      fd.set('period', per);
      const res = await addFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      const what = `${line?.name ?? 'Xodim'} · ${som(num)} so‘m avans`;
      toast.success(`Avans berildi: ${som(num)} so‘m · ${monthLabel(per)}`, {
        duration: UNDO_MS,
        action: res?.entryId ? { label: 'Qaytarish', onClick: () => onUndo(res.entryId!, what) } : undefined,
      });
      onClose();
      onDone();
    });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="border-au-line bg-au-card text-au-ink sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Xodimga avans berish</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Xodim
            <select value={who} onChange={(e) => setWho(e.target.value)} className={cn(INPUT, 'h-9 text-sm')}>
              <option value="">Tanlang…</option>
              {lines.map((l) => (
                <option key={l.staffId} value={l.staffId}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          {line && (
            <p className="text-[11px] text-au-muted">
              Hisoblangan {som(line.payable)} · to‘langan {som(line.paid)} · qoldiq {som(line.remaining)} so‘m
            </p>
          )}
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Summa, so‘m
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="500 000" className={cn(INPUT, 'h-9 tabular-nums')} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[200_000, 500_000, 1_000_000].map((v) => (
              <button key={v} type="button" onClick={() => setAmount(String(v))} className="h-7 rounded-full border border-au-line bg-au-card px-2.5 text-[11px] font-semibold hover:border-au-accent hover:bg-au-accent-soft">
                {som(v)}
              </button>
            ))}
            {line && line.remaining > 0 && (
              <button type="button" onClick={() => setAmount(String(line.remaining))} className="h-7 rounded-full border border-au-line bg-au-card px-2.5 text-[11px] font-semibold hover:border-au-accent hover:bg-au-accent-soft">
                Qoldiq: {som(line.remaining)}
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-au-muted">
            Qaysi oy oyligidan ushlansin
            <select value={per} onChange={(e) => setPer(e.target.value)} className={cn(INPUT, 'h-9 text-sm')}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Sabab (ixtiyoriy)" className={cn(INPUT, 'h-9')} />
          <div className="flex justify-end gap-2 pt-1">
            <button className={BTN_GHOST} onClick={onClose}>
              Bekor
            </button>
            <button className={cn(BTN, 'bg-au-info text-white hover:opacity-90')} disabled={busy || !who || !(num > 0)} onClick={save}>
              Avans berish
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function logLabel(e: PayRunLogEntry) {
  if (e.action === 'correction') {
    const d = e.detail as { title?: string; amount?: number };
    return `Tuzatish: ${d.title ?? ''} (${signed(Number(d.amount ?? 0))})`;
  }
  if (e.action === 'reversal') {
    const d = e.detail as { title?: string; amount?: number };
    return `${d.title ?? 'Teskari yozuv'} (${signed(Number(d.amount ?? 0))})`;
  }
  if (e.action === 'settle' || e.action === 'topup') {
    const d = e.detail as { paid?: number; total?: number; carried?: number };
    return [
      d.paid ? `Qoldiq to‘landi: ${d.paid} xodim (${som(Number(d.total ?? 0))} so‘m)` : '',
      d.carried ? `${d.carried} xodimning ortiqcha to‘lovi keyingi oyga o‘tkazildi` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Hisob-kitob yangilandi';
  }
  const [a, b] = e.action.split('→') as [PayRunStatus, PayRunStatus];
  if (!b) return e.action;
  return `${PAY_RUN_STEP[a]?.n ?? a} → ${PAY_RUN_STEP[b]?.n ?? b}`;
}

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-2.5 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wider text-au-muted uppercase">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Banner({ tone, icon, children }: { tone: 'info' | 'bad'; icon: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('ms-pop-in flex items-start gap-2 rounded-au-ctl px-3.5 py-2.5 text-sm', tone === 'info' ? 'bg-au-info-soft text-au-info' : 'bg-au-bad-soft text-au-bad')}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-au-ink">{children}</span>
    </div>
  );
}

function AdvanceItem({
  a,
  busy,
  onDecide,
}: {
  a: AdvanceRequest;
  busy: boolean;
  onDecide: (a: AdvanceRequest, ok: boolean, note?: string, targetPeriod?: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  // Which month the advance is held back from. Default = current Tashkent
  // month; the CEO may pick a later one (e.g. next month).
  const nowMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).slice(0, 7) + '-01';
  const monthOpts = [0, 1, 2].map((n) => shiftMonth(nowMonth, n));
  const [per, setPer] = useState(nowMonth);
  return (
    <li className="flex flex-col gap-1.5 rounded-au-ctl border border-au-line p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{a.staff_name}</span>
        <span className="text-sm font-bold tabular-nums">{som(a.amount)}</span>
      </div>
      <p className="text-xs text-au-muted">{a.reason}</p>
      {rejecting ? (
        <div className="flex gap-1.5">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rad etish sababi" className={cn(INPUT, 'h-8 flex-1 text-xs')} />
          <button className={cn(BTN, 'h-8 bg-au-bad px-2.5 text-xs text-white')} disabled={busy || note.trim().length < 3} onClick={() => onDecide(a, false, note.trim())}>
            Rad
          </button>
          <button className="text-au-muted" onClick={() => setRejecting(false)} aria-label="Bekor">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-1.5 text-[11px] text-au-muted">
            Qaysi oydan ushlansin:
            <select value={per} onChange={(e) => setPer(e.target.value)} className={cn(INPUT, 'h-7 flex-1 text-xs')}>
              {monthOpts.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1.5">
            <button className={cn(BTN, 'h-8 flex-1 bg-au-ok px-2.5 text-xs text-white')} disabled={busy} onClick={() => onDecide(a, true, '', per)}>
              Tasdiqlash
            </button>
            <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} disabled={busy} onClick={() => setRejecting(true)}>
              Rad etish
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NotePanel({ period, initial }: { period: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [busy, start] = useTransition();
  const dirty = note !== initial;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor="fp-month-note" className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-au-muted uppercase">
          <NotebookPen className="size-3.5" /> Oy bo‘yicha izoh
        </label>
        {dirty && (
          <button
            className="rounded bg-au-accent px-2 py-0.5 text-[11px] font-semibold text-au-accent-ink disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await savePayRunNoteAction({ period, note });
                if (res.error !== undefined) toast.error(errText(res.error));
                else toast.success('Izoh saqlandi');
              })
            }
          >
            Saqlash
          </button>
        )}
      </div>
      <textarea
        id="fp-month-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder={`${monthLabel(period)} bo‘yicha eslatma…`}
        className="w-full resize-y rounded-au-ctl border border-au-line bg-au-card-2 p-2 text-xs text-au-ink placeholder:text-au-muted focus:border-au-accent focus:outline-none"
      />
    </div>
  );
}

function LineDrawer({
  line,
  period,
  locked,
  role,
  jev,
  status,
  onDone,
}: {
  line: PayLine;
  period: string;
  locked: boolean;
  role: string;
  jev?: JevPayVerdict;
  status: string;
  onDone: () => void;
}) {
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<'none' | 'salary' | 'entry'>('none');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'adjustment' | 'penalty' | 'salary' | 'advance'>('adjustment');
  // One-click reversal of a component in a locked month (a correction that
  // points at it — the database refuses a second one).
  const [reversing, setReversing] = useState<PayComponent | null>(null);
  const [reverseWhy, setReverseWhy] = useState('');
  const num = Number(amount.replace(/\s/g, '').replace(',', '.'));
  const valid = amount.trim() !== '' && Number.isFinite(num) && num !== 0;

  const reset = () => {
    setMode('none');
    setAmount('');
    setTitle('');
    setNote('');
  };

  const saveSalary = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('staffId', line.staffId);
      fd.set('period', period);
      fd.set('grossAmount', String(num));
      const res = await setSalaryMonthAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      toast.success('Maosh saqlandi');
      reset();
      onDone();
    });

  const reverse = (c: PayComponent) =>
    start(async () => {
      const res = await addPayCorrectionAction({
        period,
        staffId: line.staffId,
        amount: -c.amount,
        title: `Teskari yozuv: ${c.title}`.slice(0, 200),
        reason: reverseWhy.trim(),
        reversalOf: c.ref,
      });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success('Teskari yozuv qo‘shildi — summa bekor qilindi');
      setReversing(null);
      setReverseWhy('');
      onDone();
    });

  const saveEntry = () =>
    start(async () => {
      if (locked) {
        const res = await addPayCorrectionAction({ period, staffId: line.staffId, amount: num, title: title.trim(), reason: note.trim() });
        if (res.error !== undefined) return void toast.error(errText(res.error));
      } else {
        const fd = new FormData();
        fd.set('staffId', line.staffId);
        fd.set('title', title.trim());
        fd.set('amount', String(kind === 'penalty' ? -Math.abs(num) : num));
        fd.set('note', note.trim());
        fd.set('kind', kind);
        fd.set('period', period);
        const res = await addFinanceEntryAction(undefined, fd);
        if (res?.error) return void toast.error(errText(res.error));
      }
      toast.success(locked ? 'Tuzatish yozuvi qo‘shildi' : 'Yozuv qo‘shildi');
      reset();
      onDone();
    });

  return (
    <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-au-line bg-au-card p-0 text-au-ink sm:max-w-lg">
      <SheetHeader className="border-b border-au-line px-5 py-5">
        <SheetTitle className="text-lg font-bold text-au-ink">{line.name}</SheetTitle>
        <SheetDescription className="text-au-muted">
          {role} · {monthLabel(period)}
        </SheetDescription>
        <div className="mt-2 flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-au-muted">To‘lanadi</span>
            <span className="text-2xl font-bold tabular-nums">
              <CountUp value={som(line.payable)} /> <span className="text-sm text-au-muted">so‘m</span>
            </span>
          </div>
          <div className="flex flex-col items-end text-xs">
            <span className="text-au-muted">To‘langan {som(line.paid)}</span>
            <span className={cn('font-bold', line.remaining > 0 ? 'text-au-accent-text' : line.remaining < 0 ? 'text-au-bad' : 'text-au-ok')}>
              Qoldiq {som(line.remaining)}
            </span>
          </div>
        </div>
        {jev && (
          <span className={cn(jev.verdict === 'check' ? CHIP_BAD : CHIP_OK, 'mt-2 w-fit')}>
            <Bot className="size-3" /> Jev: {jev.verdict === 'check' ? 'tekshirishni tavsiya qiladi' : 'odatdagidek'} ({Math.round(jev.confidence * 100)}%)
          </span>
        )}
      </SheetHeader>

      <div className="flex flex-col gap-5 px-5 py-4">
        {line.flags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {line.flags.map((f) => (
              <span key={f} className={FLAG_META[f].blocking ? CHIP_BAD : CHIP_NEUTRAL}>
                <AlertTriangle className="size-3" /> {FLAG_META[f].n}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold tracking-wide text-au-muted uppercase">Hisob tarkibi</h4>
          {line.components.length === 0 && <p className="text-sm text-au-muted">Bu oy uchun hech narsa yo‘q</p>}
          <ul className="flex flex-col divide-y divide-au-line rounded-au-ctl border border-au-line">
            {line.components.map((c, i) => {
              const canReverse = locked && !!c.ref && !c.reversed && REVERSIBLE.has(c.kind);
              const open = reversing !== null && reversing.ref === c.ref;
              return (
                <li key={i} style={{ ['--i' as string]: i }} className="ms-rise flex flex-col gap-2 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-semibold">
                        {COMPONENT_LABEL[c.kind]}
                        {c.reversed && <span className={cn(CHIP_NEUTRAL, 'ml-2')}>bekor qilingan</span>}
                      </span>
                      {c.kind !== 'base' && <span className="truncate text-[11px] text-au-muted">{c.title}</span>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          'font-bold tabular-nums',
                          c.reversed && 'line-through opacity-60',
                          c.kind === 'base' ? 'text-au-ink' : c.amount >= 0 ? 'text-au-ok' : 'text-au-bad',
                        )}
                      >
                        {c.kind === 'base' ? som(c.amount) : signed(c.amount)}
                      </span>
                      {canReverse && !open && (
                        <button
                          className="rounded-full p-1 text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                          title="Teskari yozuv bilan bekor qilish"
                          aria-label="Teskari yozuv bilan bekor qilish"
                          onClick={() => {
                            setReversing(c);
                            setReverseWhy('');
                          }}
                        >
                          <Undo2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {open && (
                    <div className="ms-pop-in flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-2">
                      <span className="text-xs text-au-muted">
                        {signed(-c.amount)} so‘m tuzatish yozuvi qo‘shiladi. Asl yozuv o‘zgarmaydi, jurnalda ikkalasi ham qoladi.
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <input
                          autoFocus
                          value={reverseWhy}
                          onChange={(e) => setReverseWhy(e.target.value)}
                          placeholder="Sabab (majburiy)"
                          className={cn(INPUT, 'min-w-40 flex-1')}
                        />
                        <button className={BTN_PRIMARY} disabled={busy || reverseWhy.trim().length < 3} onClick={() => reverse(c)}>
                          Bekor qilish
                        </button>
                        <button className={BTN_GHOST} onClick={() => setReversing(null)}>
                          Yopish
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
            <li className="flex items-center justify-between bg-au-card-2 px-3 py-2 font-bold">
              <span>To‘lanadi</span>
              <span className="tabular-nums">{som(line.payable)}</span>
            </li>
          </ul>
          {line.prevPayable !== null && (
            <p className="text-[11px] text-au-muted">
              O‘tgan oy: {som(line.prevPayable)} so‘m
              {line.delta !== null && ` (${line.delta > 0 ? '+' : ''}${Math.round(line.delta * 100)}%)`}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-bold tracking-wide text-au-muted uppercase">To‘lovlar</h4>
          {line.payments.length === 0 ? (
            <p className="text-sm text-au-muted">Hali to‘lov qayd etilmagan</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {line.payments.map((p) => (
                <li key={p.id} className="flex justify-between text-sm">
                  <span>
                    {p.kind === 'advance' ? 'Avans' : 'Oylik'} <span className="text-[11px] text-au-muted">{p.at?.slice(0, 10)}</span>
                  </span>
                  <span className="tabular-nums">{som(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {locked && (
          <p className="flex items-start gap-2 rounded-au-ctl bg-au-info-soft px-3 py-2 text-xs text-au-ink">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-au-info" />
            Oy qulflangan. O‘zgartirish faqat sababli tuzatish yozuvi bilan kiritiladi — tasdiqlangan summa o‘chmaydi.
          </p>
        )}

        {mode === 'none' ? (
          <div className="flex flex-wrap gap-2">
            {!locked && (
              <button className={BTN_GHOST} onClick={() => { setMode('salary'); setAmount(line.base ? String(line.base) : ''); }}>
                <Wallet className="size-4" /> Maoshni belgilash
              </button>
            )}
            <button className={BTN_GHOST} onClick={() => setMode('entry')}>
              <Plus className="size-4" /> {locked ? 'Tuzatish qo‘shish' : 'Yozuv qo‘shish'}
            </button>
            <button className={BTN_GHOST} onClick={() => downloadPayslips([line], period, status)}>
              <FileDown className="size-4" /> Hisob varaqasi
            </button>
            <Link href={`/finance/${line.staffId}?month=${period.slice(0, 7)}`} className={BTN_GHOST}>
              Batafsil <ArrowRight className="size-4" />
            </Link>
          </div>
        ) : (
          <div className="ms-pop-in flex flex-col gap-2 rounded-au-ctl border border-au-line bg-au-card-2 p-3">
            <span className="text-sm font-bold">{mode === 'salary' ? `${monthLabel(period)} uchun maosh` : locked ? 'Tuzatish yozuvi' : 'Yangi yozuv'}</span>
            {mode === 'entry' && !locked && (
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['adjustment', 'Bonus / tuzatish'],
                    ['penalty', 'Jarima'],
                    ['salary', 'Oylik to‘lovi'],
                    ['advance', 'Avans to‘lovi'],
                  ] as const
                ).map(([k, n]) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={cn('h-7 rounded-full px-2.5 text-xs font-semibold', kind === k ? 'bg-au-ink text-au-card' : 'bg-au-card text-au-muted')}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {mode === 'entry' && <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nomi (masalan: Bayram bonusi)" className={INPUT} />}
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder={mode === 'entry' && locked ? 'Summa (manfiy = ushlab qolish)' : 'Summa, so‘m'}
              className={cn(INPUT, 'tabular-nums')}
            />
            {mode === 'entry' && (
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={locked ? 'Sabab (majburiy)' : 'Izoh (ixtiyoriy)'} className={INPUT} />
            )}
            <div className="flex justify-end gap-2">
              <button className={BTN_GHOST} onClick={reset}>
                <ArrowLeft className="size-4" /> Bekor
              </button>
              <button
                className={BTN_PRIMARY}
                disabled={busy || (mode === 'salary' ? !(Number.isFinite(num) && num >= 0 && amount.trim() !== '') : !valid || title.trim().length < 2 || (locked && note.trim().length < 3))}
                onClick={mode === 'salary' ? saveSalary : saveEntry}
              >
                Saqlash
              </button>
            </div>
          </div>
        )}
      </div>
    </SheetContent>
  );
}

