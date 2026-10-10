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
  History,
  Lock,
  NotebookPen,
  Plus,
  Search,
  ShieldAlert,
  BookOpenCheck,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CARD_TITLE, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import { ExportButtons } from '@/components/export/export-buttons';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  addPayCorrectionAction,
  decideAdvanceAction,
  movePayRunAction,
  payOutstandingAction,
  reviewPayRunWithJevAction,
  savePayRunNoteAction,
  type JevPayVerdict,
} from '@/lib/actions/pay-run';
import { addFinanceEntryAction, setSalaryMonthAction } from '@/lib/actions/finance';
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
import type { AdvanceRequest, MonthPoint, PayRun, PayRunLogEntry } from '@/lib/pay-run-data';
import { downloadPayslips } from './payslip';
import { MonthBars } from './month-bars';

const som = (n: number) => `${formatUZS(Math.round(n))}`;
const signed = (n: number) => (n === 0 ? '—' : `${n > 0 ? '+' : '−'}${formatUZS(Math.abs(Math.round(n)))}`);
const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-au-ctl px-3.5 h-9 text-sm font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none';
const BTN_PRIMARY = cn(BTN, 'bg-au-primary text-au-primary-ink hover:opacity-90');
const BTN_GHOST = cn(BTN, 'border border-au-line bg-au-card text-au-ink hover:bg-au-card-2');

const ERR: Record<string, string> = {
  blocked: 'Tasdiqlab bo‘lmaydi — avval qizil ogohlantirishlarni hal qiling',
  invalidTransition: 'Bu bosqichga o‘tib bo‘lmaydi (sahifani yangilang)',
  reasonRequired: 'Sababini yozing (kamida 3 belgi)',
  periodLocked: 'Oy qulflangan — tuzatish yozuvi qo‘shing',
  notLocked: 'Oy hali tasdiqlanmagan — yozuvni oddiy tartibda qo‘shing',
  overLimit: 'Bu oy avanslar jami maoshdan oshib ketadi',
  noSalary: 'Bu oy uchun maosh belgilanmagan — avval maoshni kiriting',
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

type Filter = 'all' | 'flags' | 'owed' | 'over' | 'jev';

export function PayRunConsole({
  period,
  run,
  lines: allLines,
  log,
  advances,
  history,
  roleNames,
}: {
  period: string;
  run: PayRun;
  lines: PayLine[];
  log: PayRunLogEntry[];
  advances: AdvanceRequest[];
  history: MonthPoint[];
  roleNames: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const lines = useMemo(() => allLines.filter(isRelevant), [allLines]);
  const sum = totals(lines);
  const block = blockers(lines);
  const locked = run.status === 'approved' || run.status === 'paid';
  const drifted = drift(lines, run.snapshot);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [jev, setJev] = useState<Record<string, JevPayVerdict>>({});
  const [back, setBack] = useState<PayRunStatus | null>(null);
  const [reason, setReason] = useState('');
  const pendingAdv = advances.filter((a) => a.status === 'pending');

  const flagCounts = useMemo(() => {
    const m = new Map<PayFlag, PayLine[]>();
    for (const l of lines) for (const f of l.flags) m.set(f, [...(m.get(f) ?? []), l]);
    return [...m.entries()].sort((a, b) => Number(FLAG_META[b[0]].blocking) - Number(FLAG_META[a[0]].blocking));
  }, [lines]);

  const shown = lines.filter((l) => {
    if (q && !l.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === 'flags') return l.flags.length > 0;
    if (filter === 'owed') return l.remaining > 0;
    if (filter === 'over') return l.remaining < 0;
    if (filter === 'jev') return jev[l.staffId]?.verdict === 'check';
    return true;
  });
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
  const owed = lines.reduce((t, l) => t + Math.max(0, l.remaining), 0);
  const over = lines.reduce((t, l) => t + Math.min(0, l.remaining), 0);
  const unsettled = run.status === 'paid' && (owed > 0 || over !== run.carried);
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

  const askJev = () =>
    start(async () => {
      const res = await reviewPayRunWithJevAction(period);
      if (res.error !== undefined) return void toast.error(errText(res.error));
      setJev(Object.fromEntries(res.verdicts.map((v) => [v.staffId, v])));
      const n = res.verdicts.filter((v) => v.verdict === 'check').length;
      toast.success(n ? `Jev ${n} ta qatorni tekshirishni tavsiya qildi` : 'Jev: hammasi odatdagidek');
      if (n) setFilter('jev');
    });

  const decide = (a: AdvanceRequest, approve: boolean, note = '') =>
    start(async () => {
      const res = await decideAdvanceAction({ id: a.id, approve, note });
      if (res.error !== undefined) return void toast.error(errText(res.error));
      toast.success(approve ? `Avans tasdiqlandi: ${som(a.amount)} so‘m` : 'Avans rad etildi');
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Month + stepper */}
      <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-4 p-4 sm:p-5')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link href={`/finance?period=${shiftMonth(period, -1)}`} className="rounded-full p-1.5 text-au-muted hover:bg-au-card-2 hover:text-au-ink" aria-label="Oldingi oy">
              <ChevronLeft className="size-5" />
            </Link>
            <h2 className="min-w-36 text-center text-lg font-bold text-au-ink">{monthLabel(period)}</h2>
            <Link href={`/finance?period=${shiftMonth(period, 1)}`} className="rounded-full p-1.5 text-au-muted hover:bg-au-card-2 hover:text-au-ink" aria-label="Keyingi oy">
              <ChevronRight className="size-5" />
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {locked && (
              <span className={CHIP_INFO}>
                <Lock className="size-3" /> Oy qulflangan
              </span>
            )}
            {run.approved_by_name && (
              <span className="text-xs text-au-muted">
                Tasdiqladi: <b className="text-au-ink">{run.approved_by_name}</b>
              </span>
            )}
          </div>
        </div>

        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAY_RUN_STATUSES.map((s, i) => {
            const state = i < idx ? 'done' : i === idx ? 'now' : 'todo';
            return (
              <li
                key={s}
                style={{ ['--i' as string]: i }}
                className={cn(
                  'ms-rise relative flex flex-col gap-0.5 overflow-hidden rounded-au-ctl border px-3 py-2.5',
                  state === 'now' ? 'border-au-accent bg-au-accent-soft' : state === 'done' ? 'border-au-line bg-au-ok-soft/50' : 'border-au-line bg-au-card-2',
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-bold text-au-muted">
                  {state === 'done' ? <CheckCircle2 className="size-3.5 text-au-ok" /> : <span className="grid size-4 place-items-center rounded-full bg-au-card text-[10px]">{i + 1}</span>}
                  {i + 1}-bosqich
                </span>
                <span className={cn('text-sm font-bold', state === 'todo' ? 'text-au-muted' : 'text-au-ink')}>{PAY_RUN_STEP[s].n}</span>
                {state === 'now' && <span className="text-[11px] leading-4 text-au-muted">{PAY_RUN_STEP[s].hint}</span>}
                {state === 'now' && <i className="ms-fill absolute inset-x-0 bottom-0 h-0.5 origin-left bg-au-accent" />}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <button
              className={BTN_PRIMARY}
              disabled={busy || (next === 'approved' && block.length > 0)}
              onClick={() => move(next)}
              title={next === 'approved' && block.length ? 'Avval qizil ogohlantirishlarni hal qiling' : undefined}
            >
              {next === 'review' && <><ArrowRight className="size-4" /> Tekshirishga o‘tkazish</>}
              {next === 'approved' && <><BadgeCheck className="size-4" /> Tasdiqlash va oyni qulflash</>}
              {next === 'paid' && <><Banknote className="size-4" /> To‘lovlarni qayd etish ({som(owed)} so‘m)</>}
            </button>
          )}
          {unsettled && (
            <button
              className={BTN_PRIMARY}
              disabled={busy}
              onClick={payOutstanding}
              title="Tuzatishlardan keyin: qarz to‘lanadi, ortiqcha to‘lov keyingi oydan ushlanadi"
            >
              <Banknote className="size-4" /> Qoldiqni hal qilish{owed > 0 ? ` (${som(owed)} so‘m)` : ''}
            </button>
          )}
          {prev && !back && (
            <button className={BTN_GHOST} disabled={busy} onClick={() => setBack(prev)}>
              <Undo2 className="size-4" /> {run.status === 'paid' ? 'To‘lovni bekor qilish' : run.status === 'approved' ? 'Oyni qayta ochish' : 'Orqaga'}
            </button>
          )}
          {locked && (
            <button
              className={BTN_GHOST}
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
              <BookOpenCheck className="size-4" /> Buxgalteriyaga o‘tkazish
            </button>
          )}
          <button className={BTN_GHOST} disabled={busy} onClick={askJev}>
            <Bot className="size-4" /> Jev tekshiruvi
          </button>
          <button className={BTN_GHOST} disabled={busy || !lines.length} onClick={() => downloadPayslips(lines, period, PAY_RUN_STEP[run.status].n)}>
            <FileDown className="size-4" /> Hisob varaqalari (PDF)
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
              <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sabab…" className={cn(INPUT, 'min-w-60 flex-1')} />
              <button className={cn(BTN, 'bg-au-bad text-white hover:opacity-90')} disabled={busy || reason.trim().length < 3} onClick={() => move(back, reason.trim())}>
                Tasdiqlash
              </button>
              <button className={BTN_GHOST} onClick={() => setBack(null)}>
                Bekor
              </button>
            </div>
          </div>
        )}
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { n: 'Ish haqi fondi', v: som(sum.payable), sub: `maosh ${som(sum.base)} · KPI ${signed(sum.kpi)}`, tone: 'text-au-ink' },
          { n: 'Bonuslar', v: `+${som(sum.bonuses)}`, sub: 'o‘zini rivojlantirish, rag‘bat, missiya', tone: 'text-au-ok' },
          { n: 'Ushlanmalar', v: `−${som(Math.abs(sum.deductions))}`, sub: 'jarima va tuzatishlar', tone: 'text-au-bad' },
          { n: 'To‘langan', v: som(sum.paid), sub: `${sum.payable ? Math.round((sum.paid / sum.payable) * 100) : 0}% fonddan`, tone: 'text-au-ink' },
          { n: 'Qoldiq', v: som(sum.remaining), sub: `${lines.filter((l) => l.remaining > 0).length} xodimga`, tone: sum.remaining > 0 ? 'text-au-accent-text' : 'text-au-muted' },
        ].map((k, i) => (
          <div key={k.n} style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-1 p-4', i === 0 && 'col-span-2 lg:col-span-1')}>
            <span className="text-xs font-semibold text-au-muted">{k.n}</span>
            <span className={cn('text-xl font-bold tabular-nums', k.tone)}>
              <CountUp value={k.v} />
            </span>
            <span className="truncate text-[11px] text-au-muted">{k.sub}</span>
          </div>
        ))}
      </div>

      {drifted.length > 0 && (
        <Banner tone="info" icon={<History className="size-4" />}>
          Tasdiqlangandan keyin {drifted.length} xodimning summasi o‘zgardi (tuzatish yozuvlari):{' '}
          {drifted.map((d) => `${lines.find((l) => l.staffId === d.staffId)?.name}: ${som(d.was)} → ${som(d.now)}`).join('; ')}
        </Banner>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Table */}
        <section className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col')} style={{ ['--i' as string]: 2 }}>
          <div className="flex flex-wrap items-center gap-2 border-b border-au-line p-3">
            <label className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-au-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Xodimni qidirish" className={cn(INPUT, 'h-9 pl-8')} />
            </label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['all', `Hammasi ${lines.length}`],
                  ['flags', `Ogohlantirish ${lines.filter((l) => l.flags.length).length}`],
                  ['owed', `Qoldig‘i bor ${lines.filter((l) => l.remaining > 0).length}`],
                  ['over', `Ortiqcha ${lines.filter((l) => l.remaining < 0).length}`],
                  ...(Object.keys(jev).length ? [['jev', `Jev: tekshirish ${Object.values(jev).filter((v) => v.verdict === 'check').length}`]] : []),
                ] as [Filter, string][]
              ).map(([k, n]) => (
                <button
                  key={k}
                  onClick={() => setFilter(k)}
                  className={cn('h-8 rounded-full px-3 text-xs font-semibold transition', filter === k ? 'bg-au-ink text-au-card' : 'bg-au-card-2 text-au-muted hover:text-au-ink')}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold tracking-wide text-au-muted uppercase">
                  <th className="px-3 py-2.5">Xodim</th>
                  <th className="px-3 py-2.5 text-right">Maosh</th>
                  <th className="px-3 py-2.5 text-right">KPI</th>
                  <th className="px-3 py-2.5 text-right">Bonus</th>
                  <th className="px-3 py-2.5 text-right">Ushlanma</th>
                  <th className="px-3 py-2.5 text-right">To‘lanadi</th>
                  <th className="px-3 py-2.5 text-right">To‘langan</th>
                  <th className="px-3 py-2.5 text-right">Qoldiq</th>
                  <th className="px-3 py-2.5">Holat</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => (
                  <tr
                    key={l.staffId}
                    onClick={() => setOpenId(l.staffId)}
                    style={{ ['--i' as string]: Math.min(i, 15) }}
                    className="ms-rise cursor-pointer border-t border-au-line transition hover:bg-au-card-2"
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col">
                        <span className="font-semibold text-au-ink">{l.name}</span>
                        <span className="text-[11px] text-au-muted">{roleNames[l.role] ?? l.role}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{l.base ? som(l.base) : <span className="text-au-bad">—</span>}</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', l.kpi > 0 ? 'text-au-ok' : l.kpi < 0 ? 'text-au-bad' : 'text-au-muted')}>{signed(l.kpi)}</td>
                    <td className="px-3 py-2.5 text-right text-au-ok tabular-nums">{l.bonuses ? `+${som(l.bonuses)}` : <span className="text-au-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-right text-au-bad tabular-nums">{l.deductions ? `−${som(Math.abs(l.deductions))}` : <span className="text-au-muted">—</span>}</td>
                    <td className="px-3 py-2.5 text-right font-bold tabular-nums">
                      {som(l.payable)}
                      {l.delta !== null && Math.abs(l.delta) >= 0.05 && (
                        <span className={cn('ml-1 text-[10px] font-semibold', l.delta > 0 ? 'text-au-ok' : 'text-au-bad')}>
                          {l.delta > 0 ? '▲' : '▼'}
                          {Math.round(Math.abs(l.delta) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{som(l.paid)}</td>
                    <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', l.remaining > 0 ? 'text-au-accent-text' : l.remaining < 0 ? 'text-au-bad' : 'text-au-muted')}>
                      {som(l.remaining)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {jev[l.staffId] && (
                          <span className={jev[l.staffId].verdict === 'check' ? CHIP_BAD : CHIP_OK} title={`Jev ishonchi ${Math.round(jev[l.staffId].confidence * 100)}%`}>
                            <Bot className="size-3" /> {jev[l.staffId].verdict === 'check' ? 'Tekshiring' : 'OK'}
                          </span>
                        )}
                        {l.flags.slice(0, 2).map((f) => (
                          <span key={f} className={FLAG_META[f].blocking ? CHIP_BAD : CHIP_NEUTRAL}>
                            {FLAG_META[f].n}
                          </span>
                        ))}
                        {l.flags.length > 2 && <span className={CHIP_NEUTRAL}>+{l.flags.length - 2}</span>}
                        {!l.flags.length && !jev[l.staffId] && (l.remaining === 0 && l.payable > 0 ? <span className={CHIP_OK}>To‘langan</span> : <span className={CHIP_NEUTRAL}>Tayyor</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-au-line bg-au-card-2 font-bold">
                  <td className="px-3 py-2.5">Jami</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{som(sum.base)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{signed(sum.kpi)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">+{som(sum.bonuses)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">−{som(Math.abs(sum.deductions))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{som(sum.payable)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{som(sum.paid)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{som(sum.remaining)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {!shown.length && <p className="p-6 text-center text-sm text-au-muted">Bu filtr bo‘yicha xodim yo‘q</p>}
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Panel title="Tasdiqlashdan oldin" icon={<ShieldAlert className="size-4" />} i={3}>
            {flagCounts.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-au-ok">
                <CheckCircle2 className="size-4" /> Hamma tekshiruvlar o‘tdi
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {flagCounts.map(([f, ls]) => (
                  <li key={f}>
                    <button onClick={() => setFilter('flags')} className="flex w-full items-center justify-between gap-2 text-left text-sm">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className={cn('size-3.5', FLAG_META[f].blocking ? 'text-au-bad' : 'text-au-muted')} />
                        {FLAG_META[f].n}
                      </span>
                      <span className={FLAG_META[f].blocking ? CHIP_BAD : CHIP_NEUTRAL}>{ls.length}</span>
                    </button>
                    <p className="mt-0.5 truncate pl-5 text-[11px] text-au-muted">{ls.map((l) => l.name).join(', ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Avans so‘rovlari${pendingAdv.length ? ` · ${pendingAdv.length}` : ''}`} icon={<Wallet className="size-4" />} i={4}>
            {pendingAdv.length === 0 ? (
              <p className="text-sm text-au-muted">Kutilayotgan so‘rov yo‘q</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pendingAdv.map((a) => (
                  <AdvanceItem key={a.id} a={a} busy={busy} onDecide={decide} />
                ))}
              </ul>
            )}
            {advances.some((a) => a.status !== 'pending') && (
              <details className="mt-2 text-xs text-au-muted">
                <summary className="cursor-pointer font-semibold">Oxirgi qarorlar</summary>
                <ul className="mt-2 flex flex-col gap-1">
                  {advances
                    .filter((a) => a.status !== 'pending')
                    .slice(0, 8)
                    .map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span className="truncate">{a.staff_name}</span>
                        <span className={a.status === 'approved' ? 'text-au-ok' : 'text-au-muted'}>
                          {som(a.amount)} · {a.status === 'approved' ? 'tasdiqlangan' : a.status === 'rejected' ? 'rad etilgan' : 'bekor qilingan'}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Panel>

          <Panel title="12 oy: fond va to‘lovlar" icon={<Banknote className="size-4" />} i={5}>
            <MonthBars points={history} current={period} />
          </Panel>

          <NotePanel period={period} initial={run.note ?? ''} />

          <Panel title="Jurnal" icon={<History className="size-4" />} i={7}>
            {log.length === 0 ? (
              <p className="text-sm text-au-muted">Hali harakat yo‘q</p>
            ) : (
              <ol className="flex flex-col gap-2 text-xs">
                {log.slice(0, 12).map((e) => (
                  <li key={e.id} className="flex flex-col border-l-2 border-au-line pl-2">
                    <span className="font-semibold text-au-ink">{logLabel(e)}</span>
                    <span className="text-au-muted">
                      {e.actor ?? 'Tizim'} · {e.at.slice(0, 16).replace('T', ' ')}
                      {typeof e.detail.reason === 'string' && e.detail.reason ? ` · “${e.detail.reason}”` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
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
    </div>
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

function Panel({ title, icon, i, children }: { title: string; icon: ReactNode; i: number; children: ReactNode }) {
  return (
    <section style={{ ['--i' as string]: i }} className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')}>
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <span className="text-au-muted">{icon}</span>
        {title}
      </h3>
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

function AdvanceItem({ a, busy, onDecide }: { a: AdvanceRequest; busy: boolean; onDecide: (a: AdvanceRequest, ok: boolean, note?: string) => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
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
        <div className="flex gap-1.5">
          <button className={cn(BTN, 'h-8 flex-1 bg-au-ok px-2.5 text-xs text-white')} disabled={busy} onClick={() => onDecide(a, true)}>
            Tasdiqlash
          </button>
          <button className={cn(BTN_GHOST, 'h-8 px-2.5 text-xs')} disabled={busy} onClick={() => setRejecting(true)}>
            Rad etish
          </button>
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
    <Panel title="Oy bo‘yicha izoh" icon={<NotebookPen className="size-4" />} i={6}>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Masalan: bayram bonusi, yangi xodimlar…" className={cn(INPUT, 'resize-y py-2 text-sm')} />
      {dirty && (
        <button
          className={cn(BTN_PRIMARY, 'h-8 self-end text-xs')}
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
    </Panel>
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

