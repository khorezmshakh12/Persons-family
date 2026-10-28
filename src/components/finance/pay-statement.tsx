'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FileDown, HandCoins, Undo2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CHIP_BAD, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import { cancelAdvanceAction, requestAdvanceAction } from '@/lib/actions/pay-run';
import { COMPONENT_LABEL, monthLabel, type PayLine } from '@/lib/pay-run';
import type { AdvanceRequest, MonthPoint } from '@/lib/pay-run-data';
import { downloadPayslips } from './payslip';
import { MonthBars } from './month-bars';

const som = (n: number) => formatUZS(Math.round(n));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatUZS(Math.abs(Math.round(n)))}`;

const ADV_ERR: Record<string, string> = {
  alreadyPending: 'Sizda ko‘rib chiqilayotgan so‘rov bor',
  overLimit: 'Avans oylik maoshdan oshmasligi kerak',
  noSalary: 'Bu oy uchun maoshingiz hali belgilanmagan — avans so‘rab bo‘lmaydi',
  alreadyDecided: 'So‘rov allaqachon ko‘rib chiqilgan',
  invalidInput: 'Summa va sababni tekshiring',
};

/** One person's month: what they get, where each sum comes from, what has
 * been paid and what is left — the same numbers the CEO's pay run shows. */
export function PayStatement({
  line,
  period,
  history,
  advances,
  isSelf,
}: {
  line: PayLine | null;
  period: string;
  history: MonthPoint[];
  advances: AdvanceRequest[] | null;
  isSelf: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <PayStatementCard line={line} period={period} />
      <aside className="flex flex-col gap-4">
        <PayHistoryCard history={history} period={period} />
        {isSelf && advances && <AdvancePanel advances={advances} />}
      </aside>
    </div>
  );
}

export function PayHistoryCard({ history, period }: { history: MonthPoint[]; period: string }) {
  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 1 }}>
      <h3 className="text-xs font-bold tracking-wider text-au-muted uppercase">12 oy: fond va to‘lovlar</h3>
      <MonthBars points={history} current={period} />
    </section>
  );
}

/** The owner-design statement card: status, three headline boxes, then every
 * component and payment of the month as one list. */
export function PayStatementCard({ line, period }: { line: PayLine | null; period: string }) {
  const remaining = line?.remaining ?? 0;
  const owed = Math.max(0, remaining);
  const over = Math.max(0, -remaining);
  const pct = line && line.payable > 0 ? Math.min(100, Math.round((line.paid / line.payable) * 100)) : 0;
  const box3 =
    owed > 0
      ? { n: 'Oylik qoldig‘i (olinishi kerak)', v: `${som(owed)} so‘m`, tone: 'text-au-accent-text' }
      : over > 0
        ? { n: 'Keyingi oy uchun avans', v: `+${som(over)} so‘m`, tone: 'text-au-info' }
        : { n: 'Joriy balans', v: '0 so‘m', tone: 'text-au-ok' };
  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex min-w-0 flex-col gap-4 p-5')}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-au-line pb-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-au-ink">Oylik va avans hisob varaqasi ({monthLabel(period)})</h3>
          <p className="text-xs text-au-muted">Hisoblangan oylik, bonus/jarima va olingan to‘lovlar tafsiloti</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {owed > 0 ? (
            <span className="fp-chip fp-chip-accent">To‘lanishi kerak: {som(owed)}</span>
          ) : over > 0 ? (
            <span className="fp-chip fp-chip-info">Avans olgan: +{som(over)}</span>
          ) : line && line.paid > 0 ? (
            <span className="fp-chip fp-chip-ok">✓ To‘liq to‘langan</span>
          ) : null}
          {line && (
            <button
              onClick={() => downloadPayslips([line], period)}
              className="inline-flex h-7 items-center gap-1.5 rounded-au-ctl border border-au-line bg-au-card px-2.5 text-xs font-semibold text-au-ink hover:bg-au-card-2"
            >
              <FileDown className="size-3.5" /> Kvitansiya PDF
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
          <span className="block text-[11px] text-au-muted">Hisoblangan oylik</span>
          <b className="text-base break-words tabular-nums">
            <CountUp value={som(line?.payable ?? 0)} /> so‘m
          </b>
        </div>
        <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
          <span className="block text-[11px] text-au-muted">Jami olingan (to‘langan)</span>
          <b className="text-base break-words text-au-ok tabular-nums">{som(line?.paid ?? 0)} so‘m</b>
        </div>
        <div className="min-w-0 rounded-lg border border-au-line bg-au-card-2 p-3">
          <span className="block text-[11px] text-au-muted">{box3.n}</span>
          <b className={cn('text-base break-words tabular-nums', box3.tone)}>{box3.v}</b>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="fp-kpi-bar h-2">
          <i style={{ width: `${pct}%`, background: 'var(--au-ok)' }} />
        </div>
        <span className="text-[11px] text-au-muted">{pct}% to‘langan</span>
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-bold tracking-wider text-au-muted uppercase">{monthLabel(period)} — barcha yozuvlar va to‘lovlar</h4>
        {!line || (line.components.length === 0 && line.payments.length === 0) ? (
          <p className="text-sm text-au-muted">Bu oy uchun hali hisob yo‘q</p>
        ) : (
          <>
            {line.components.map((c, i) => (
              <div
                key={`c${i}`}
                style={{ ['--i' as string]: i }}
                className="ms-rise flex items-center justify-between gap-3 rounded-lg border border-au-line bg-au-card-2/50 px-3.5 py-2.5 text-xs"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-semibold text-au-ink">{COMPONENT_LABEL[c.kind]}</span>
                  <span className="truncate text-[11px] text-au-muted">
                    {c.kind !== 'base' ? c.title : 'Hisoblangan'}
                    {c.at ? ` · ${c.at.slice(0, 10)}` : ''}
                  </span>
                </div>
                <span className={cn('shrink-0 font-bold tabular-nums', c.kind === 'base' ? 'text-au-ink' : c.amount >= 0 ? 'text-au-ok' : 'text-au-bad')}>
                  {c.kind === 'base' ? som(c.amount) : signed(c.amount)} so‘m
                </span>
              </div>
            ))}
            {line.payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-au-line bg-au-card-2/50 px-3.5 py-2.5 text-xs">
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-semibold text-au-ink">
                    <span className="truncate">{p.title || (p.kind === 'advance' ? 'Avans' : 'Oylik')}</span>
                    <span className={cn('fp-chip h-4 px-1.5 text-[10px]', p.kind === 'advance' ? 'fp-chip-info' : 'fp-chip-ok')}>{p.kind === 'advance' ? 'Avans' : 'Oylik'}</span>
                  </span>
                  <span className="text-[11px] text-au-muted">To‘lov{p.at ? ` · ${p.at.slice(0, 10)}` : ''}</span>
                </div>
                <span className={cn('shrink-0 font-bold tabular-nums', p.kind === 'advance' ? 'text-au-info' : 'text-au-ok')}>+{som(p.amount)} so‘m</span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}

export function AdvancePanel({ advances }: { advances: AdvanceRequest[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const num = Number(amount.replace(/\s/g, ''));
  const pending = advances.find((a) => a.status === 'pending');

  const submit = () =>
    start(async () => {
      const res = await requestAdvanceAction({ amount: num, reason: reason.trim() });
      if (res.error !== undefined) return void toast.error(ADV_ERR[res.error] ?? 'Yuborib bo‘lmadi');
      setOpen(false);
      setAmount('');
      setReason('');
      toast.success('So‘rov yuborildi — CEO’ga xabar ketdi');
      router.refresh();
    });

  const cancel = (id: string) =>
    start(async () => {
      const res = await cancelAdvanceAction(id);
      if (res.error !== undefined) return void toast.error(ADV_ERR[res.error] ?? 'Bekor qilib bo‘lmadi');
      toast.success('So‘rov qaytarib olindi');
      router.refresh();
    });

  return (
    <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 2 }}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-au-ink">
        <HandCoins className="size-4 text-au-info" /> Tezkor avans so‘rovi
      </h3>
      <p className="text-xs text-au-muted">So‘rov «Ish haqi» bo‘limidagi avans so‘rovlari ro‘yxatiga tushadi.</p>
      {pending ? (
        <div className="flex flex-col gap-1.5 rounded-au-ctl bg-au-info-soft p-3 text-sm">
          <span>
            <b className="tabular-nums">{som(pending.amount)} so‘m</b> so‘rovingiz ko‘rib chiqilmoqda
          </span>
          <button disabled={busy} onClick={() => cancel(pending.id)} className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-au-muted hover:text-au-ink">
            <Undo2 className="size-3.5" /> Qaytarib olish
          </button>
        </div>
      ) : open ? (
        <div className="ms-pop-in flex flex-col gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Summa, so‘m" className={cn(INPUT, 'tabular-nums')} />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Sabab" className={INPUT} />
          <p className="text-[11px] text-au-muted">Tasdiqlansa, shu oyning oyligidan ushlab qolinadi.</p>
          <div className="flex justify-end gap-2">
            <button className="h-8 px-3 text-xs font-semibold text-au-muted" onClick={() => setOpen(false)}>
              Bekor
            </button>
            <button
              disabled={busy || !(num > 0) || reason.trim().length < 3}
              onClick={submit}
              className="h-8 rounded-au-ctl bg-au-primary px-3 text-xs font-semibold text-au-primary-ink disabled:opacity-50"
            >
              Yuborish
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="h-9 rounded-au-ctl border border-au-line text-sm font-semibold hover:bg-au-card-2">
          Avans so‘rash
        </button>
      )}
      {advances.filter((a) => a.status !== 'pending').length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {advances
            .filter((a) => a.status !== 'pending')
            .slice(0, 5)
            .map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="tabular-nums">{som(a.amount)}</span>
                <span className={a.status === 'approved' ? CHIP_OK : a.status === 'rejected' ? CHIP_BAD : CHIP_NEUTRAL} title={a.decision_note ?? undefined}>
                  {a.status === 'approved' ? 'Tasdiqlangan' : a.status === 'rejected' ? 'Rad etilgan' : 'Bekor qilingan'}
                </span>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
