'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Copy,
  Receipt,
  Wallet,
  History,
  NotebookPen,
  Pencil,
  Search,
  Target,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { MoneyInput } from '@/components/ui/money-input';
import { formatUZS } from '@/lib/format-currency';
import { ExportButtons } from '@/components/export/export-buttons';
import {
  decideAdvanceAction,
  decideReimbursementAction,
  payAllRemainingAction,
  reviewPayRunWithJevAction,
  savePayRunNoteAction,
  type JevPayVerdict,
} from '@/lib/actions/pay-run';
import {
  addAdvanceInstallmentsAction,
  addFinanceEntryAction,
  bulkAddEntriesAction,
  copyBasesFromPrevAction,
  deleteFinanceEntryAction,
  getAttendanceProrationAction,
  setSalaryFromAction,
  setSalaryMonthAction,
  updateFinanceEntryAction,
  type AttendanceProration,
} from '@/lib/actions/finance';
import { postPayrollAction } from '@/lib/actions/accounting';
import { getBpointSnapshotAction } from '@/lib/actions/bpoint';
import type { BpointGoalView } from '@/lib/bpoint-data';
import {
  blockers,
  EDITABLE_SOURCES,
  FLAG_META,
  isRelevant,
  REVERSIBLE,
  shiftMonth,
  totals,
  type PayComponent,
  type PayLine,
} from '@/lib/pay-run';
import type { AdvanceRequest, MonthPoint, PayRun, PayRunLogEntry, RecentEntry, Reimbursement } from '@/lib/pay-run-data';
import type { CashBox } from '@/lib/pay-cash';
import { useLocale, useTranslations } from 'next-intl';
import { monthYear } from '@/lib/month-names';
import { downloadPayslips } from './payslip';
import { MonthBars } from './month-bars';

/* Finance v2 (owner, 2026-10-21): one calm screen — three states, one
 * button to reopen a month, every number traceable, every hand-made row
 * editable while the month is open, and an undo after each change. */

const som = (n: number) => formatUZS(Math.round(n));
const signed = (n: number) => (n === 0 ? '0' : `${n > 0 ? '+' : '−'}${formatUZS(Math.abs(Math.round(n)))}`);
const digits = (v: string) => v.replace(/[^\d]/g, '');

const CARD = 'rounded-[24px] border border-au-line bg-au-card';
const BTN =
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-4 text-sm font-semibold transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-45';
const BTN_DARK = cn(BTN, 'bg-au-ink text-au-card hover:opacity-90');
const BTN_OK = cn(BTN, 'bg-au-ok text-white hover:opacity-90');
const BTN_SOFT = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');
const SM = 'h-9 rounded-xl px-3 text-[13px]';
const FIELD =
  'h-11 w-full min-w-0 rounded-xl border border-au-line bg-au-card px-3 text-sm font-semibold text-au-ink tabular-nums outline-none transition focus:border-au-accent disabled:bg-au-card-2 disabled:text-au-muted';
const ICON_BTN =
  'inline-grid size-9 shrink-0 place-items-center rounded-xl text-au-muted transition hover:bg-au-card-2 hover:text-au-ink disabled:pointer-events-none disabled:opacity-35';
const CHIP = 'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-bold';

type Tr = ReturnType<typeof useTranslations>;
const ERR_KEYS = ['overLimit', 'noSalary', 'pastMonth', 'nothingOwed', 'systemEntry', 'groupedAdvance', 'alreadyDecided', 'reasonRequired', 'aiDisabled', 'aiFailed', 'forbidden', 'notFound', 'invalidInput'];
/** Translated texts shared by every part of the screen. */
function usePayText() {
  const t = useTranslations('pay');
  const tAll = useTranslations();
  const locale = useLocale();
  const mL = (p: string) => monthYear(locale, p);
  const errText = (c: string) => (ERR_KEYS.includes(c) ? tAll(`pay.err.${c}`) : tAll('pay.err.other'));
  return { t, tAll, mL, errText };
}
const UNDO_MS = 15000;

/** Kinds the add form offers → what finance_entries stores. */
const ADD_KINDS = {
  bonus: { n: 'bonus', kind: 'adjustment', sign: 1 },
  penalty: { n: 'penalty', kind: 'penalty', sign: -1 },
  advance: { n: 'advance', kind: 'advance', sign: 1 },
  salary: { n: 'salary', kind: 'salary', sign: 1 },
} as const;
type AddKind = keyof typeof ADD_KINDS;
const UZ_KIND: Record<AddKind, string> = { bonus: 'Bonus', penalty: 'Jarima', advance: 'Avans', salary: 'Oylik to‘lovi' };

type Filter = 'all' | 'owed' | 'done' | 'over' | 'flags';
const COLS = 'grid-cols-[28px_minmax(200px,1.6fr)_repeat(3,minmax(110px,1fr))_112px_96px]';
const METHOD_KEY = 'pv2-method';
const FILTERS: Filter[] = ['all', 'owed', 'done', 'over', 'flags'];

const owedOf = (l: PayLine) => Math.max(0, l.remaining);
const overOf = (l: PayLine) => Math.max(0, -l.remaining);

function lineState(l: PayLine): { n: string; cls: string } {
  if (l.remaining < 0) return { n: 'advance', cls: 'bg-au-info-soft text-au-info' };
  if (l.remaining === 0) return { n: 'paid', cls: 'bg-au-ok-soft text-au-ok' };
  if (l.paid > 0) return { n: 'partial', cls: 'bg-au-accent-soft text-au-accent-text' };
  return { n: 'unpaid', cls: 'bg-au-card-2 text-au-muted' };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size / 3) }}
      className="grid shrink-0 place-items-center rounded-full bg-au-card-2 font-bold text-au-ink"
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

const hhmm = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const when = (at: string | null | undefined) => (at ? hhmm.format(new Date(at)) : '');

/** Human line for one pay_run_log row. */
function logLabel(e: PayRunLogEntry, tAll: Tr, mL: (p: string) => string): string {
  const t = (k: string, v?: Record<string, string | number>) => tAll(`pay.log.${k}`, v);
  const d = e.detail as Record<string, unknown>;
  const n = (v: unknown) => som(Math.abs(Number(v ?? 0)));
  switch (e.action) {
    case 'entry.add':
      return t('added', { title: String(d.title ?? t('entry')), sum: n(d.amount) });
    case 'entry.edit':
      return `${t('edited', { title: String(d.title ?? ''), from: n(d.from), to: n(d.to) })}${d.movedTo ? t('moved', { month: mL(String(d.movedTo)) }) : ''}`;
    case 'entry.delete':
      return t('deleted', { title: String(d.title ?? ''), sum: n(d.amount) });
    case 'salary.set':
      return `${t('salary', { sum: n(d.amount) })}${d.months ? t('salaryMonths', { n: String(d.months) }) : ''}`;
    case 'salary.copy':
      return t('copy', { n: String(d.count) });
    case 'reimburse.approve':
      return t('rApprove', { title: String(d.title ?? ''), sum: n(d.amount) });
    case 'reimburse.reject':
      return t('rReject', { title: String(d.title ?? '') });
    case 'correction':
    case 'reversal':
      return `${String(d.title ?? t('correction'))} (${signed(Number(d.amount ?? 0))})`;
    case 'settle':
    case 'topup':
      return d.paid ? t('settled', { n: String(d.paid) }) : t('updated');
  }
  // Status moves from before the month lock was removed (2026-10-21).
  const b = e.action.split('→')[1];
  if (!b) return e.action;
  if (b === 'draft') return t('reopened');
  if (b === 'approved') return t('approved');
  if (b === 'paid') return `${t('paidAll')}${d.paid ? t('paidN', { n: String(d.paid) }) : ''}`;
  return e.action;
}

export function PayrollV2({
  period,
  run,
  lines: allLines,
  log,
  advances,
  history,
  roleNames,
  recent = [],
  boxes = [],
  reimbursements = [],
}: {
  period: string;
  run: PayRun;
  lines: PayLine[];
  log: PayRunLogEntry[];
  advances: AdvanceRequest[];
  history: MonthPoint[];
  roleNames: Record<string, string>;
  recent?: RecentEntry[];
  /** Cash boxes a payment can leave from (naqd, karta, bank…). */
  boxes?: CashBox[];
  /** Pending "xarajatni qoplash" requests. */
  reimbursements?: Reimbursement[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const { t, tAll, mL, errText } = usePayText();
  const lines = useMemo(() => allLines.filter(isRelevant), [allLines]);
  const sum = totals(lines);
  const owed = lines.reduce((t, l) => t + owedOf(l), 0);
  const over = lines.reduce((t, l) => t + overOf(l), 0);
  const owedCount = lines.filter((l) => l.remaining > 0).length;
  const block = blockers(lines);
  const overNeg = lines.reduce((t, l) => t + Math.min(0, l.remaining), 0);
  // Something to settle: someone is owed, or the overpayments differ from
  // what was already carried into next month.
  const toSettle = owedCount > 0 || overNeg !== run.carried;
  const pending = advances.filter((a) => a.status === 'pending');

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sel, setSel] = useState<string | null>(lines[0]?.staffId ?? null);
  const [jev, setJev] = useState<Record<string, JevPayVerdict>>({});
  const [showRecent, setShowRecent] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // The cash box payments leave from — remembered per device.
  const [method, setMethodState] = useState(boxes[0]?.code ?? '');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(METHOD_KEY);
      // Reading the device's saved choice after hydration (localStorage is
      // not available on the server).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved && boxes.some((b) => b.code === saved)) setMethodState(saved);
    } catch {}
    // Mount-only: boxes come from the server and do not change while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setMethod = (code: string) => {
    setMethodState(code);
    try {
      localStorage.setItem(METHOD_KEY, code);
    } catch {}
  };
  const boxName = (code?: string | null) => boxes.find((b) => b.code === code)?.name ?? null;
  const noBase = lines.filter((l) => l.flags.includes('noBase'));

  const shown = lines.filter((l) => {
    if (q && !`${l.name} ${roleNames[l.role] ?? l.role}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'owed') return l.remaining > 0;
    if (filter === 'done') return l.remaining === 0;
    if (filter === 'over') return l.remaining < 0;
    if (filter === 'flags') return l.flags.length > 0 || jev[l.staffId]?.verdict === 'check';
    return true;
  });
  const selLine = lines.find((l) => l.staffId === sel) ?? shown[0] ?? null;

  const refresh = () => router.refresh();

  // Takes back a ledger row entered by mistake.
  const undo = (entryId: string, what: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set('entryId', entryId);
      const res = await deleteFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      toast.success(t('undone', { what }));
      setShowRecent(false);
      refresh();
    });

  const payAll = () =>
    start(async () => {
      const res = await payAllRemainingAction({ period, method: method || undefined });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(
        `${res.paidCount ? t('paidAllN', { n: res.paidCount }) : t('settleUpdated')}${res.carried ? t('carried', { n: res.carried }) : ''}`,
      );
      refresh();
    });

  const quickPay = (l: PayLine) =>
    start(async () => {
      const fd = new FormData();
      fd.set('staffId', l.staffId);
      fd.set('title', `${monthYear('uz', period)} oyligi`);
      fd.set('amount', String(owedOf(l)));
      fd.set('kind', 'salary');
      fd.set('period', period);
      if (method) fd.set('method', method);
      const res = await addFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      const what = `${l.name} · ${som(owedOf(l))} ${t('uzs')}`;
      toast.success(t('paidToast', { name: l.name, sum: som(owedOf(l)) }), {
        duration: UNDO_MS,
        action: res?.entryId ? { label: t('undo'), onClick: () => undo(res.entryId!, what) } : undefined,
      });
      refresh();
    });

  const decide = (a: AdvanceRequest, approve: boolean, targetPeriod?: string, note = '') =>
    start(async () => {
      const res = await decideAdvanceAction({ id: a.id, approve, note, targetPeriod, method: method || undefined });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(approve ? t('advOk', { sum: som(a.amount) }) : t('advNo'));
      refresh();
    });

  const decideReimburse = (r: Reimbursement, approve: boolean, targetPeriod?: string, note = '') =>
    start(async () => {
      const res = await decideReimbursementAction({ id: r.id, approve, note, targetPeriod });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(approve ? t('rOk', { sum: som(r.amount) }) : t('rNo'));
      refresh();
    });

  const copyBases = () =>
    start(async () => {
      const res = await copyBasesFromPrevAction(period);
      if (res.error) return void toast.error(errText(res.error));
      toast.success(res.count ? t('basesCopied', { n: res.count }) : t('noPrev'));
      refresh();
    });

  // Takes back every row a bulk add made.
  const undoMany = (ids: string[]) =>
    start(async () => {
      for (const id of ids) {
        const fd = new FormData();
        fd.set('entryId', id);
        const res = await deleteFinanceEntryAction(undefined, fd);
        if (res?.error) return void toast.error(errText(res.error));
      }
      toast.success(t('undoneN', { n: ids.length }));
      refresh();
    });

  const askJev = () =>
    start(async () => {
      const res = await reviewPayRunWithJevAction(period);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setJev(Object.fromEntries(res.verdicts.map((v) => [v.staffId, v])));
      const n = res.verdicts.filter((v) => v.verdict === 'check').length;
      toast.success(n ? t('jevN', { n }) : t('jevOk'));
      if (n) setFilter('flags');
    });

  const paidPct = sum.payable > 0 ? Math.round((sum.paid / sum.payable) * 100) : 0;
  const tiles = [
    { n: t('tFund'), v: sum.payable, hint: t('tFundHint'), dot: 'bg-au-ink' },
    { n: t('tPaid'), v: sum.paid, hint: t('tPaidHint', { n: paidPct }), dot: 'bg-au-ok' },
    { n: t('tOwed'), v: owed, hint: t('tOwedHint', { n: owedCount }), dot: 'bg-au-accent' },
    { n: t('tOver'), v: over, hint: t('tOverHint'), dot: 'bg-au-info' },
  ];
  const monthLog = log.filter((e) => !(e.detail as { staffId?: string }).staffId).slice(0, 8);

  return (
    <div className="flex flex-col gap-5">
      {/* Month, state and the one main action */}
      <section className={cn(CARD, 'flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5')}>
        <div className="flex items-center gap-2.5">
          <Link href={`/finance?period=${shiftMonth(period, -1)}`} className={cn(ICON_BTN, 'size-11 border border-au-line')} aria-label={t('prevMonth')}>
            <ChevronLeft className="size-5" />
          </Link>
          <div className="min-w-40 text-center">
            <div className="text-[11px] font-bold tracking-widest text-au-muted uppercase">{t('workMonth')}</div>
            <h1 className="text-xl font-extrabold text-au-ink sm:text-2xl">{t('workOf', { m: mL(period).split(' ')[0] })}</h1>
            <div className="text-xs text-au-faint">{t('payMonth', { m: mL(shiftMonth(period, 1)) })}</div>
          </div>
          <Link href={`/finance?period=${shiftMonth(period, 1)}`} className={cn(ICON_BTN, 'size-11 border border-au-line')} aria-label={t('nextMonth')}>
            <ChevronRight className="size-5" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          {boxes.length > 0 && (
            <label className="flex h-11 items-center gap-2 rounded-2xl border border-au-line bg-au-card pr-1 pl-3 text-[13px] font-semibold text-au-muted">
              <Wallet className="size-4" />
              <span className="sr-only sm:not-sr-only">{t('payFrom')}</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 rounded-xl bg-transparent pr-1 text-sm font-bold text-au-ink outline-none"
                aria-label={t('payFromLabel')}
              >
                {boxes.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {toSettle && (
            <button className={BTN_OK} disabled={busy} onClick={payAll}>
              <Check className="size-4" /> {owedCount ? t('payAllN', { n: owedCount }) : t('carryOver')}
            </button>
          )}
        </div>
      </section>

      {block.length > 0 && (
        <div className="flex items-start gap-3 rounded-[20px] bg-au-bad-soft px-4 py-3.5 text-sm font-semibold text-au-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-au-bad" />
          <span>
            {t('checkIt')} {block.map((l) => l.name).join(', ')} — {[...new Set(block.flatMap((l) => l.flags.filter((f) => FLAG_META[f].blocking).map((f) => tAll(`pay.flag.${f}`))))].join(', ')}.
          </span>
        </div>
      )}

      {noBase.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-au-line bg-au-card px-4 py-3 text-sm text-au-ink">
          <span>
            <b>{t('noBaseN', { n: noBase.length })}</b> {t('noBaseMsg', { m: mL(period) })}
          </span>
          <button className={cn(BTN_SOFT, SM)} disabled={busy} onClick={copyBases}>
            <Copy className="size-4" /> {t('copyPrev')}
          </button>
        </div>
      )}

      {/* Reimbursement requests */}
      {reimbursements.length > 0 && (
        <section className={cn(CARD, 'flex flex-col gap-3 p-4 sm:p-5')}>
          <h2 className="flex items-center gap-2 text-base font-extrabold text-au-ink">
            <Receipt className="size-4" /> {t('reimb')} <span className="font-semibold text-au-muted">· {reimbursements.length}</span>
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reimbursements.map((r) => (
              <RequestItem
                key={r.id}
                name={r.staff_name}
                amount={r.amount}
                text={[r.title, r.note, r.spent_on && t('dateOf', { d: r.spent_on })].filter(Boolean).join(' · ')}
                period={period}
                busy={busy}
                approveLabel={t('addToSalary')}
                onDecide={(ok, per, note) => decideReimburse(r, ok, per, note)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Advance requests waiting for a decision */}
      {pending.length > 0 && (
        <section className={cn(CARD, 'flex flex-col gap-3 p-4 sm:p-5')}>
          <h2 className="text-base font-extrabold text-au-ink">
            {t('advReqs')} <span className="font-semibold text-au-muted">· {pending.length}</span>
          </h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pending.map((a) => (
              <RequestItem
                key={a.id}
                name={a.staff_name}
                amount={a.amount}
                text={a.reason}
                period={period}
                initial={a.period}
                busy={busy}
                approveLabel={t('approve')}
                onDecide={(ok, per, note) => decide(a, ok, per, note)}
              />
            ))}
          </ul>
        </section>
      )}

      {/* Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.n} className={cn(CARD, 'flex flex-col gap-2 p-5')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-au-muted">{x.n}</span>
              <span className={cn('size-2.5 rounded-full', x.dot)} />
            </div>
            <div className="text-2xl font-extrabold tracking-tight break-words text-au-ink tabular-nums">
              {som(x.v)} <span className="text-sm font-semibold text-au-muted">{t('uzs')}</span>
            </div>
            <div className="text-xs text-au-muted">{x.hint}</div>
          </div>
        ))}
      </div>

      {/* Staff list + selected person */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className={cn(CARD, 'flex min-w-0 flex-col gap-3 p-3 sm:p-4')}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 pt-1">
            <h2 className="text-lg font-extrabold text-au-ink">
              {t('staff')} <span className="font-semibold text-au-muted">· {shown.length}</span>
            </h2>
            <label className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-au-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPh')} className={cn(FIELD, 'h-10 pl-9 font-medium')} aria-label={t('search')} />
            </label>
          </div>
          <div className="flex flex-wrap gap-1.5 px-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn('h-9 rounded-full px-3.5 text-[13px] font-semibold transition', filter === f ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
              >
                {tAll(`pay.f.${f}`)}
              </button>
            ))}
          </div>

          {picked.size > 0 && (
            <BulkBar
              count={picked.size}
              period={period}
              busy={busy}
              onAdd={(kind, amount, title, per) =>
                start(async () => {
                  const res = await bulkAddEntriesAction({ staffIds: [...picked], kind, amount, title, period: per });
                  if (res.error) return void toast.error(errText(res.error));
                  const ids = res.ids ?? [];
                  toast.success(t('bulkDone', { title, n: ids.length, sum: som(amount) }), {
                    duration: UNDO_MS,
                    action: ids.length ? { label: t('undo'), onClick: () => undoMany(ids) } : undefined,
                  });
                  setPicked(new Set());
                  refresh();
                })
              }
              onClear={() => setPicked(new Set())}
            />
          )}
          <div className="overflow-x-auto">
            <div className="flex min-w-[760px] flex-col gap-0.5">
              <div className={cn('grid items-center gap-3 px-3 pt-1 pb-2 text-xs font-bold text-au-muted', COLS)}>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--au-accent)]"
                  checked={shown.length > 0 && shown.every((l) => picked.has(l.staffId))}
                  onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((l) => l.staffId)) : new Set())}
                  aria-label={t('pickAll')}
                />
                <span>{t('colStaff')}</span>
                <span className="text-right">{t('colPayable')}</span>
                <span className="text-right">{t('colPaid')}</span>
                <span className="text-right">{t('colLeft')}</span>
                <span>{t('colState')}</span>
                <span />
              </div>
              {shown.length === 0 && <p className="px-3 py-8 text-center text-sm text-au-muted">{t('nobody')}</p>}
              {shown.map((l) => {
                const st = lineState(l);
                const on = selLine?.staffId === l.staffId;
                return (
                  <div
                    key={l.staffId}
                    className={cn(
                      'grid items-center gap-3 rounded-2xl border px-3 py-2.5 transition',
                      COLS,
                      on ? 'border-au-accent/30 bg-au-accent-soft' : 'border-transparent hover:bg-au-card-2',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--au-accent)]"
                      checked={picked.has(l.staffId)}
                      onChange={(e) =>
                        setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(l.staffId);
                          else next.delete(l.staffId);
                          return next;
                        })
                      }
                      aria-label={t('pick', { name: l.name })}
                    />
                    <button onClick={() => setSel(l.staffId)} className="flex min-w-0 items-center gap-3 text-left" aria-pressed={on}>
                      <Avatar name={l.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-au-ink">{l.name}</span>
                        <span className="flex items-center gap-1.5 text-xs text-au-muted">
                          {roleNames[l.role] ?? l.role}
                          {(l.flags.length > 0 || jev[l.staffId]?.verdict === 'check') && <AlertTriangle className="size-3.5 text-au-bad" aria-label={t('hasWarn')} />}
                        </span>
                      </span>
                    </button>
                    <span className="text-right font-bold text-au-ink tabular-nums">{som(l.payable)}</span>
                    <span className="text-right font-bold text-au-ok tabular-nums">{som(l.paid)}</span>
                    <span className={cn('text-right font-extrabold tabular-nums', l.remaining > 0 ? 'text-au-accent-text' : l.remaining < 0 ? 'text-au-bad' : 'text-au-muted')}>
                      {som(l.remaining)}
                    </span>
                    <span>
                      <span className={cn(CHIP, st.cls)}>{tAll(`pay.st.${st.n}`)}</span>
                    </span>
                    <span className="text-right">
                      {l.remaining > 0 && (
                        <button className={cn(BTN_OK, SM)} disabled={busy} onClick={() => quickPay(l)}>
                          {t('payBtn')}
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
              {shown.length > 0 && (
                <div className={cn('grid gap-3 border-t border-au-line px-3 pt-3 text-sm font-extrabold text-au-ink', COLS)}>
                  <span />
                  <span>{t('totalShown')}</span>
                  <span className="text-right tabular-nums">{som(shown.reduce((t, l) => t + l.payable, 0))}</span>
                  <span className="text-right text-au-ok tabular-nums">{som(shown.reduce((t, l) => t + l.paid, 0))}</span>
                  <span className="text-right tabular-nums">{som(shown.reduce((t, l) => t + l.remaining, 0))}</span>
                  <span />
                  <span />
                </div>
              )}
            </div>
          </div>
        </section>

        {selLine ? (
          <StaffPanel
            key={selLine.staffId}
            line={selLine}
            period={period}
            role={roleNames[selLine.role] ?? selLine.role}
            jev={jev[selLine.staffId]}
            log={log.filter((e) => (e.detail as { staffId?: string }).staffId === selLine.staffId)}
            onUndo={undo}
            method={method}
            boxName={boxName}
          />
        ) : (
          <section className={cn(CARD, 'p-6 text-sm text-au-muted')}>{t('noStaff')}</section>
        )}
      </div>

      {/* Tools, month history, journal and note */}
      <section className={cn(CARD, 'flex flex-wrap items-center gap-2 p-3 sm:p-4')}>
        <span className="mr-1 text-xs font-bold tracking-wider text-au-muted uppercase">{t('tools')}</span>
        {recent.length > 0 && (
          <div className="relative">
            <button className={cn(BTN_SOFT, SM)} disabled={busy} aria-expanded={showRecent} onClick={() => setShowRecent((v) => !v)}>
              <History className="size-4" /> {t('recent', { n: recent.length })}
            </button>
            {showRecent && (
              <div className="absolute bottom-full left-0 z-30 mb-2 w-80 max-w-[calc(100vw-2rem)] rounded-[20px] border border-au-line bg-au-card p-2 shadow-[var(--au-shadow-pop)]">
                <p className="px-2 pb-1.5 text-[11px] text-au-muted">{t('recentHint')}</p>
                <ul className="flex flex-col">
                  {recent.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-au-card-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-au-ink">{r.staffName}</div>
                        <div className="truncate text-[11px] text-au-muted">
                          {r.title} · {when(r.at)}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-au-ink tabular-nums">{som(r.amount)}</span>
                      <button
                        className="shrink-0 rounded-lg border border-au-line px-2 py-1 text-[11px] font-semibold text-au-bad hover:bg-au-bad-soft"
                        disabled={busy}
                        onClick={() => undo(r.id, `${r.staffName} · ${som(Math.abs(r.amount))} ${t('uzs')}`)}
                      >
                        {t('undo')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <button className={cn(BTN_SOFT, SM)} disabled={busy || !lines.length} onClick={() => downloadPayslips(lines, period)}>
          <FileDown className="size-4" /> {t('payslips')}
        </button>
        <button className={cn(BTN_SOFT, SM)} disabled={busy} onClick={askJev}>
          <Bot className="size-4" /> {t('jevCheck')}
        </button>
        <button
            className={cn(BTN_SOFT, SM)}
            disabled={busy}
            title={t('postTip')}
            onClick={() =>
              start(async () => {
                const res = await postPayrollAction(period.slice(0, 7));
                if (res.error !== undefined) return void toast.error(errText(res.error));
                toast.success(t('posted', { n: res.count ?? 0 }));
              })
            }
          >
            <BookOpenCheck className="size-4" /> {t('post')}
          </button>
        <ExportButtons
          filename={`oylik-${period.slice(0, 7)}`}
          columns={[
            { header: t('colStaff'), key: 'name' },
            { header: t('xBase'), key: 'base' },
            { header: t('xKpi'), key: 'kpi' },
            { header: t('xBonus'), key: 'bonuses' },
            { header: t('xDed'), key: 'deductions' },
            { header: t('xCarry'), key: 'carry' },
            { header: t('xAdv'), key: 'advanceShift' },
            { header: t('colPayable'), key: 'payable' },
            { header: t('colPaid'), key: 'paid' },
            { header: t('colLeft'), key: 'remaining' },
          ]}
          rows={lines.map((l) => ({ ...l }))}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className={cn(CARD, 'flex flex-col gap-3 p-5')}>
          <h2 className="text-base font-extrabold text-au-ink">{t('m12')}</h2>
          <MonthBars points={history} current={period} />
          <YearForecast history={history} period={period} payable={sum.payable} />
        </section>
        <section className={cn(CARD, 'flex flex-col gap-3 p-5')}>
          <h2 className="text-base font-extrabold text-au-ink">{t('monthLog')}</h2>
          {monthLog.length === 0 ? (
            <p className="text-sm text-au-muted">{t('nothingYet')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {monthLog.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="w-20 shrink-0 text-xs text-au-muted tabular-nums">{when(e.at)}</span>
                  <span className="min-w-0 text-au-ink">
                    {logLabel(e, tAll, mL)}
                    {e.actor && <span className="text-au-muted"> · {e.actor}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={cn(CARD, 'p-5')}>
          <NotePanel key={period} period={period} initial={run.note ?? ''} />
        </section>
      </div>
    </div>
  );
}

/** One request waiting for a decision — an advance or a reimbursement:
 * approve into a chosen month, or reject with a reason. */
function RequestItem({
  name,
  amount,
  text,
  period,
  initial,
  busy,
  approveLabel,
  onDecide,
}: {
  name: string;
  amount: number;
  text?: string | null;
  period: string;
  initial?: string | null;
  busy: boolean;
  approveLabel: string;
  onDecide: (approve: boolean, targetPeriod?: string, note?: string) => void;
}) {
  const months = [0, 1, 2].map((n) => shiftMonth(period, n));
  const [per, setPer] = useState(initial && months.includes(initial) ? initial : period);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const { t, mL } = usePayText();
  return (
    <li className="flex flex-col gap-2.5 rounded-[20px] border border-au-line bg-au-card-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-bold text-au-ink">{name}</span>
        <span className="font-extrabold text-au-ink tabular-nums">{som(amount)}</span>
      </div>
      {text && <p className="text-xs text-au-muted">{text}</p>}
      {rejecting ? (
        <div className="flex gap-2">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('rejectReason')} className={cn(FIELD, 'h-9 font-medium')} />
          <button className={cn(BTN, SM, 'bg-au-bad text-white')} disabled={busy || note.trim().length < 3} onClick={() => onDecide(false, undefined, note.trim())}>
            {t('rejectShort')}
          </button>
          <button className={ICON_BTN} onClick={() => setRejecting(false)} aria-label={t('cancel')}>
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select value={per} onChange={(e) => setPer(e.target.value)} className={cn(FIELD, 'h-9 w-auto flex-1 font-medium')} aria-label={t('fromMonth')}>
            {months.map((m) => (
              <option key={m} value={m}>
                {t('fromMonthOpt', { m: mL(m) })}
              </option>
            ))}
          </select>
          <button className={cn(BTN_OK, SM)} disabled={busy} onClick={() => onDecide(true, per)}>
            {approveLabel}
          </button>
          <button className={cn(BTN_SOFT, SM)} disabled={busy} onClick={() => setRejecting(true)}>
            {t('reject')}
          </button>
        </div>
      )}
    </li>
  );
}

/** The same bonus or jarima for every ticked person, for this month or a later one. */
function BulkBar({
  count,
  period,
  busy,
  onAdd,
  onClear,
}: {
  count: number;
  period: string;
  busy: boolean;
  onAdd: (kind: 'adjustment' | 'penalty', amount: number, title: string, period: string) => void;
  onClear: () => void;
}) {
  const [kind, setKind] = useState<'adjustment' | 'penalty'>('adjustment');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [per, setPer] = useState(period);
  const num = Number(digits(amount));
  const { t, tAll, mL } = usePayText();
  const name = title.trim() || tAll(kind === 'penalty' ? 'pay.kind.penalty' : 'pay.kind.bonus');
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[20px] border border-au-accent/30 bg-au-accent-soft p-2.5">
      <span className="px-1 text-sm font-bold text-au-ink">{t('nPicked', { n: count })}</span>
      <div className="flex rounded-xl bg-au-card p-0.5">
        {(['adjustment', 'penalty'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={cn('h-8 rounded-lg px-3 text-[13px] font-semibold', kind === k ? 'bg-au-ink text-au-card' : 'text-au-muted')}
          >
            {tAll(k === 'penalty' ? 'pay.kind.penalty' : 'pay.kind.bonus')}
          </button>
        ))}
      </div>
      <MoneyInput value={amount ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : String(v))} placeholder={t('amount')} className={cn(FIELD, 'h-9 w-32 text-right')} aria-label={t('amount')} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePh')} className={cn(FIELD, 'h-9 w-56 flex-1 font-medium')} aria-label={t('title')} />
      <select value={per} onChange={(e) => setPer(e.target.value)} className={cn(FIELD, 'h-9 w-auto font-medium')} aria-label={t('forMonth')}>
        {[0, 1, 2, 3].map((n) => {
          const m = shiftMonth(period, n);
          return (
            <option key={m} value={m}>
              {mL(m)}
            </option>
          );
        })}
      </select>
      <button className={cn(BTN_DARK, SM)} disabled={busy || !num} onClick={() => onAdd(kind, num, name, per)}>
        {t('addAll')}
      </button>
      <button className={ICON_BTN} onClick={onClear} aria-label={t('clearPick')}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/** This year's fund: each earlier month's computed pay (one month each,
 * never mixed), plus this month's for every month left — a straight-line
 * year-end estimate. */
function YearForecast({ history, period, payable }: { history: MonthPoint[]; period: string; payable: number }) {
  const year = period.slice(0, 4);
  const left = 12 - Number(period.slice(5, 7)) + 1;
  const before = history.filter((p) => p.period.startsWith(year) && p.period < period).reduce((t, p) => t + p.planned, 0);
  const { t } = usePayText();
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-au-card-2 px-3.5 py-2.5 text-sm">
      <span className="text-au-muted">
        {t('yearFund', { y: year })}
        <span className="block text-[11px]">{t('yearHint', { n: left })}</span>
      </span>
      <b className="text-au-ink tabular-nums">{som(before + payable * left)}</b>
    </div>
  );
}

function NotePanel({ period, initial }: { period: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [busy, start] = useTransition();
  const { t, mL, errText } = usePayText();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor="pv2-note" className="flex items-center gap-2 text-base font-extrabold text-au-ink">
          <NotebookPen className="size-4" /> {t('monthNote')}
        </label>
        {note !== initial && (
          <button
            className={cn(BTN_DARK, 'h-8 rounded-lg px-3 text-xs')}
            disabled={busy}
            onClick={() =>
              start(async () => {
                const res = await savePayRunNoteAction({ period, note });
                if (res.error !== undefined) toast.error(errText(res.error));
                else toast.success(t('noteSaved'));
              })
            }
          >
            {t('save')}
          </button>
        )}
      </div>
      <textarea
        id="pv2-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={4}
        placeholder={t('notePh', { m: mL(period) })}
        className="w-full resize-y rounded-2xl border border-au-line bg-au-card-2 p-3 text-sm text-au-ink placeholder:text-au-muted focus:border-au-accent focus:outline-none"
      />
    </div>
  );
}

/** Everything about one person's month: how the pay is made up, what was
 * paid, every row editable, entries for any month, B-nuqta. */
function StaffPanel({
  line,
  period,
  role,
  jev,
  log,
  onUndo,
  method,
  boxName,
}: {
  line: PayLine;
  period: string;
  role: string;
  jev?: JevPayVerdict;
  log: PayRunLogEntry[];
  onUndo: (entryId: string, what: string) => void;
  /** The cash box chosen in the header — payments added here leave from it. */
  method: string;
  boxName: (code?: string | null) => string | null;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [base, setBase] = useState(String(line.base || ''));
  const [edit, setEdit] = useState<{ id: string; title: string; value: string } | null>(null);
  const [kind, setKind] = useState<AddKind>('bonus');
  const [per, setPer] = useState(period);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [bp, setBp] = useState<BpointGoalView[] | null>(null);
  const [forward, setForward] = useState(false);
  const [split, setSplit] = useState(1);
  const [att, setAtt] = useState<AttendanceProration | null>(null);
  const { t, tAll, mL, errText } = usePayText();
  const kindName = (k: AddKind) => tAll(`pay.kind.${ADD_KINDS[k].n}`);

  // B-nuqta for this person; re-read when their pay changes. Async only —
  // the panel remounts per person (key), so no reset is needed here.
  useEffect(() => {
    let alive = true;
    getBpointSnapshotAction(line.staffId).then((r) => {
      if (alive && !('error' in r)) setBp(r.goals);
    });
    return () => {
      alive = false;
    };
  }, [line.staffId, line.payable]);

  // Attendance this month, for prorating the base (only shown if marked).
  useEffect(() => {
    let alive = true;
    getAttendanceProrationAction(line.staffId, period).then((r) => {
      if (alive && !('error' in r)) setAtt(r);
    });
    return () => {
      alive = false;
    };
  }, [line.staffId, period]);

  const months = [0, 1, 2, 3].map((n) => shiftMonth(period, n));
  const num = Number(digits(amount));
  const done = (msg: string, entryId?: string, what?: string) => {
    toast.success(msg, entryId && what ? { duration: UNDO_MS, action: { label: t('undo'), onClick: () => onUndo(entryId, what) } } : undefined);
    router.refresh();
  };

  const saveBase = (value = digits(base) || '0') =>
    start(async () => {
      if (forward) {
        const res = await setSalaryFromAction({ staffId: line.staffId, period, grossAmount: Number(value) });
        if (res.error) return void toast.error(errText(res.error));
        setForward(false);
        return done(t('salaryFrom', { m: mL(period), n: res.count ?? 0 }));
      }
      const fd = new FormData();
      fd.set('staffId', line.staffId);
      fd.set('period', period);
      fd.set('grossAmount', value);
      const res = await setSalaryMonthAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      done(t('baseSaved'));
    });
  const prorated = att && att.workDays > 0 && line.base > 0 && att.present < att.workDays ? Math.round((line.base * att.present) / att.workDays) : null;

  const add = () =>
    start(async () => {
      const k = ADD_KINDS[kind];
      // The stored title stays Uzbek (ledger text), whatever the UI language.
      const name = title.trim() || `${UZ_KIND[kind]}${per === period ? '' : ` · ${monthYear('uz', per)} uchun`}`;
      if (kind === 'advance' && split > 1) {
        const res = await addAdvanceInstallmentsAction({ staffId: line.staffId, period: per, amount: num, months: split, title: title.trim(), method: method || undefined });
        if (res.error) return void toast.error(errText(res.error));
        setAmount('');
        setTitle('');
        return done(t('advSplit', { sum: som(num), n: split }));
      }
      const fd = new FormData();
      fd.set('staffId', line.staffId);
      fd.set('title', name);
      fd.set('amount', String(k.sign * num));
      fd.set('kind', k.kind);
      fd.set('period', per);
      if (method && (kind === 'advance' || kind === 'salary')) fd.set('method', method);
      const res = await addFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      setAmount('');
      setTitle('');
      done(t('addedToast', { name, sum: som(num) }), res?.entryId, `${line.name} · ${name}`);
    });

  const saveEdit = () =>
    start(async () => {
      if (!edit) return;
      const fd = new FormData();
      fd.set('entryId', edit.id);
      fd.set('title', edit.title);
      fd.set('amount', digits(edit.value) || '0');
      const res = await updateFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      setEdit(null);
      done(t('amountChanged'));
    });

  // A system component (KPI, rag‘bat, missiya…) is cancelled with an
  // opposite hand-made row in the open month — visible, and deletable again.
  const cancel = (c: PayComponent) =>
    start(async () => {
      const fd = new FormData();
      fd.set('staffId', line.staffId);
      fd.set('title', `Bekor: ${c.title}`.slice(0, 200));
      fd.set('amount', String(-c.amount));
      fd.set('kind', 'adjustment');
      fd.set('period', period);
      // Points at exactly this component, so a twin with the same title stays.
      if (c.ref) fd.set('reversalOf', c.ref);
      const res = await addFinanceEntryAction(undefined, fd);
      if (res?.error) return void toast.error(errText(res.error));
      done(t('cancelledToast', { title: c.title }), res?.entryId, t('cancelWhat', { title: c.title }));
    });
  // Older cancels were matched by title only (before reversal_of was written).
  const cancelled = new Set(line.components.filter((c) => c.kind !== 'correction' && c.title.startsWith('Bekor: ')).map((c) => c.title.slice(7)));

  const editable = (source?: string) => !!source && EDITABLE_SOURCES.has(source);
  const extras = line.components.filter((c) => c.kind !== 'base');
  const pct = line.payable > 0 ? Math.min(100, Math.round((line.paid / line.payable) * 100)) : 0;

  // B-nuqta = oylik maqsad (yarim yil / 1 yil / 3 yil), olingan summa
  // bo'yicha (src/lib/bpoint-data.ts). Only the goals that are set.
  const bGoals = bp?.filter((g) => g.target > 0) ?? [];

  // A split-advance share is part of one whole: it can only be removed
  // together with the advance (server deletes the group), not edited alone.
  const rowBtns = (id: string, tt: string, amt: number, src?: string, whole = false) =>
    editable(src) && (
      <>
        {!whole && (
          <button className={ICON_BTN} onClick={() => setEdit({ id, title: tt, value: String(Math.abs(amt)) })} aria-label={t('edit')}>
            <Pencil className="size-4" />
          </button>
        )}
        <button className={ICON_BTN} disabled={busy} onClick={() => onUndo(id, `«${tt}» ${som(Math.abs(amt))} ${t('uzs')}`)} aria-label={t('delete')}>
          <Trash2 className="size-4" />
        </button>
      </>
    );
  const editor = (id: string) =>
    edit?.id === id && (
      <div className="flex items-center gap-2">
        <MoneyInput
          autoFocus
          value={edit.value ? Number(digits(edit.value)) : null}
          onValue={(v) => setEdit({ ...edit, value: v == null ? '' : String(v) })}
          placeholder=""
          className={cn(FIELD, 'h-9 w-32 text-right')}
          aria-label={t('newAmount')}
        />
        <button className={cn(BTN_DARK, SM)} disabled={busy || !digits(edit.value)} onClick={saveEdit}>
          {t('save')}
        </button>
        <button className={ICON_BTN} onClick={() => setEdit(null)} aria-label={t('cancel')}>
          <X className="size-4" />
        </button>
      </div>
    );

  return (
    <aside className={cn(CARD, 'flex min-w-0 flex-col gap-5 p-5 xl:sticky xl:top-4')}>
      <div className="flex items-center gap-3.5">
        <Avatar name={line.name} size={52} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-au-ink">{line.name}</h2>
          <p className="text-[13px] text-au-muted">
            {role} · {mL(period)}
          </p>
        </div>
        <Link href={`/finance/${line.staffId}?month=${period.slice(0, 7)}`} className={ICON_BTN} aria-label={t('staffFinance')}>
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {(line.flags.length > 0 || jev?.verdict === 'check') && (
        <div className="flex flex-wrap gap-1.5">
          {line.flags.map((f) => (
            <span key={f} className={cn(CHIP, FLAG_META[f].blocking ? 'bg-au-bad-soft text-au-bad' : 'bg-au-card-2 text-au-muted')}>
              <AlertTriangle className="size-3" /> {tAll(`pay.flag.${f}`)}
            </span>
          ))}
          {jev?.verdict === 'check' && (
            <span className={cn(CHIP, 'bg-au-info-soft text-au-info')}>
              <Bot className="size-3" /> {t('jevCheckIt')}
            </span>
          )}
        </div>
      )}

      {/* How the pay is made up — every line, top to bottom */}
      <div className="flex flex-col gap-2.5 rounded-[20px] bg-au-card-2 p-4">
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-au-ink">{t('base')}</span>
          <span className="flex items-center gap-2">
            <MoneyInput
              value={base ? Number(digits(base)) : null}
              onValue={(v) => setBase(v == null ? '' : String(v))}
              placeholder=""
              className={cn(FIELD, 'h-10 w-36 text-right')}
              aria-label={t('base')}
            />
            {digits(base) !== String(line.base || '') && (
              <button className={cn(BTN_DARK, SM)} disabled={busy} onClick={() => saveBase()}>
                {t('save')}
              </button>
            )}
          </span>
        </label>
        {digits(base) !== String(line.base || '') && (
          <label className="flex items-center gap-2 text-xs text-au-muted">
            <input type="checkbox" className="size-4 accent-[var(--au-accent)]" checked={forward} onChange={(e) => setForward(e.target.checked)} />
            {t('forward')}
          </label>
        )}
        {prorated !== null && att && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-au-card px-3 py-2 text-xs text-au-muted">
            <span>
              {t('attendance')} <b className="text-au-ink">{att.present}</b> {t('daysTo', { n: att.workDays })} <b className="text-au-ink tabular-nums">{som(prorated)}</b>
            </span>
            <button className="font-semibold text-au-accent-text hover:underline" disabled={busy} onClick={() => setBase(String(prorated))}>
              {t('apply')}
            </button>
          </div>
        )}
        {extras.map((c, i) => (
          <div key={c.entryId ?? c.ref ?? i} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className={cn('block truncate text-au-ink', c.reversed && 'line-through opacity-60')}>{c.title}</span>
                <span className="block text-[11px] text-au-muted">{tAll(`pay.comp.${c.kind}`)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <span className={cn('mr-1 font-bold tabular-nums', c.amount >= 0 ? 'text-au-ok' : 'text-au-bad', c.reversed && 'line-through opacity-60')}>{signed(c.amount)}</span>
                {c.entryId && rowBtns(c.entryId, c.title, c.amount, c.source, c.kind === 'advshift')}
                {!editable(c.source) && !c.reversed && REVERSIBLE.has(c.kind) && !cancelled.has(c.title) && (
                  <button className={ICON_BTN} disabled={busy} onClick={() => cancel(c)} aria-label={t('cancelRev')} title={t('cancelRevTip')}>
                    <Undo2 className="size-4" />
                  </button>
                )}
              </span>
            </div>
            {c.entryId && editor(c.entryId)}
          </div>
        ))}
        <div className="h-px bg-au-line" />
        <div className="flex justify-between text-[15px] font-extrabold text-au-ink">
          <span>{t('payable')}</span>
          <span className="tabular-nums">{som(line.payable)}</span>
        </div>

        {line.payments.map((p) => (
          <div key={p.id} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-au-ink">{p.kind === 'advance' ? t('pAdvance') : t('pSalary')}</span>
                <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-au-muted">
                  {when(p.at)}
                  {boxName(p.method) && <span>· {boxName(p.method)}</span>}
                  {p.receipt?.status === 'received' && <span className="font-semibold text-au-ok">{t('gotIt')}</span>}
                  {p.receipt?.status === 'disputed' && (
                    <span className="font-semibold text-au-bad" title={p.receipt.note}>
                      {t('issue', { n: p.receipt.note ?? '' })}
                    </span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <span className="mr-1 font-bold text-au-ok tabular-nums">{som(p.amount)}</span>
                {rowBtns(p.id, p.title, p.amount, p.source)}
              </span>
            </div>
            {editor(p.id)}
          </div>
        ))}
        <div className="h-px bg-au-line" />
        <div className="flex items-center justify-between text-base font-extrabold">
          <span className="text-au-ink">{line.remaining > 0 ? t('leftToPay') : line.remaining < 0 ? t('nextAdvance') : t('closed')}</span>
          <span className={cn('tabular-nums', line.remaining > 0 ? 'text-au-accent-text' : line.remaining < 0 ? 'text-au-bad' : 'text-au-ok')}>
            {som(Math.abs(line.remaining))}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-au-line" role="img" aria-label={t('pctPaid', { n: pct })}>
          <div className={cn('h-full rounded-full', line.remaining < 0 ? 'bg-au-bad' : 'bg-au-ok')} style={{ width: `${pct}%` }} />
        </div>
        {line.prevPayable !== null && (
          <p className="text-[11px] text-au-muted">
            {t('lastMonth', { sum: som(line.prevPayable) })}{line.delta !== null && ` (${line.delta > 0 ? '+' : ''}${Math.round(line.delta * 100)}%)`}
          </p>
        )}
      </div>

      {/* Add a row for this month or a later one */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-extrabold text-au-ink">{t('addEntry')}</h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(ADD_KINDS) as AddKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn('h-9 rounded-full px-3.5 text-[13px] font-semibold transition', kind === k ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
            >
              {kindName(k)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select value={per} onChange={(e) => setPer(e.target.value)} className={cn(FIELD, 'font-medium')} aria-label={t('forMonth')}>
            {months.map((m, i) => (
              <option key={m} value={m}>
                {mL(m)}
                {i === 0 ? t('thisMonth') : t('forSuffix')}
              </option>
            ))}
          </select>
          <MoneyInput value={amount ? Number(digits(amount)) : null} onValue={(v) => setAmount(v == null ? '' : String(v))} placeholder={t('amountUzs')} className={cn(FIELD, 'text-right')} aria-label={t('amount')} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titleOpt', { k: kindName(kind) })} className={cn(FIELD, 'col-span-2 font-medium')} aria-label={t('title')} />
          {kind === 'advance' && (
            <select value={split} onChange={(e) => setSplit(Number(e.target.value))} className={cn(FIELD, 'col-span-2 font-medium')} aria-label={t('howDeduct')}>
              {[1, 2, 3, 4, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? t('oneMonth') : t('splitN', { n, per: num ? som(Math.floor(num / n)) : '…' })}
                </option>
              ))}
            </select>
          )}
        </div>
        <p className="text-xs text-au-muted">
          {per === period
            ? t('inThis')
            : t('inOther', { m: mL(per), how: kind === 'advance' ? t('howAdv') : t('howOther') })}
          {(kind === 'advance' || kind === 'salary') && boxName(method) && t('payWith', { b: boxName(method) ?? '' })}
        </p>
        <button className={BTN_DARK} disabled={busy || !num} onClick={add}>
          {t('addKind', { k: kindName(kind) })}{num ? ` · ${som(num)} ${t('uzs')}` : ''}
        </button>
      </div>

      {/* B-nuqta: every goal that is set (yarim yil / 1 yil / 3 yil) */}
      <div className="flex flex-col gap-2.5 rounded-[20px] border border-au-accent/25 bg-au-accent-soft p-4">
        <span className="flex items-center gap-2 text-[15px] font-extrabold text-au-ink">
          <Target className="size-4 text-au-accent-text" /> {t('bpoint')}
        </span>
        {!bp ? (
          <div className="h-12 animate-pulse rounded-xl bg-au-card/60" />
        ) : bGoals.length === 0 ? (
          <p className="text-xs text-au-muted">{t('noBpoint')}</p>
        ) : (
          bGoals.map((g) => {
            const p = g.progress;
            return (
              <div key={g.horizon} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <b className="text-au-ink">{tAll(`bp.h.${g.horizon}`)}</b>
                  <b className="text-au-accent-text tabular-nums">{p.pct}%</b>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-au-card" role="img" aria-label={`${t('bpoint')} ${tAll(`bp.h.${g.horizon}`)} ${p.pct}%`}>
                  <div className="absolute inset-y-0 left-0 rounded-full bg-au-accent" style={{ width: `${Math.min(100, p.pct)}%` }} />
                  {p.start > 0 && (
                    <div className="absolute inset-y-0 w-0.5 bg-au-ink" style={{ left: `${Math.min(100, Math.round((p.start / p.target) * 100))}%` }} title={t('aPoint')} />
                  )}
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-au-muted">
                  <span>
                    {t('now')} <b className="text-au-ink tabular-nums">{som(p.current)}</b> / {som(p.target)} {t('perMonth')}
                  </span>
                  {p.current >= p.target ? (
                    <span className="font-semibold text-au-ok">{t('reached')}</span>
                  ) : (
                    <span>
                      {t('more')} <b className="text-au-ink tabular-nums">{som(p.gap)}</b> {t('uzs')}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* This person's history this month */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[15px] font-extrabold text-au-ink">{t('history')}</h3>
        {log.length === 0 ? (
          <p className="text-xs text-au-muted">{t('noChanges')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {log.slice(0, 10).map((e) => (
              <li key={e.id} className="flex gap-3 text-[13px]">
                <span className="w-20 shrink-0 text-au-muted tabular-nums">{when(e.at)}</span>
                <span className="min-w-0 text-au-ink">
                  {logLabel(e, tAll, mL)}
                  {e.actor && <span className="text-au-muted"> · {e.actor}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className={cn(BTN_SOFT, SM, 'self-start')} onClick={() => downloadPayslips([line], period)}>
        <FileDown className="size-4" /> {t('statement')}
      </button>
    </aside>
  );
}

