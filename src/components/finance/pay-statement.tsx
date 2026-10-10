'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Clock3, FileDown, HandCoins, Lock, Undo2 } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { formatUZS } from '@/lib/format-currency';
import { CARD_TITLE, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, INPUT, SURFACE_CARD } from '@/lib/glass';
import { CountUp } from '@/components/motion/count-up';
import { cancelAdvanceAction, requestAdvanceAction } from '@/lib/actions/pay-run';
import { COMPONENT_LABEL, PAY_RUN_STEP, type PayLine, type PayRunStatus } from '@/lib/pay-run';
import type { AdvanceRequest, MonthPoint } from '@/lib/pay-run-data';
import { downloadPayslips } from './payslip';
import { MonthBars } from './month-bars';

const som = (n: number) => formatUZS(Math.round(n));
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatUZS(Math.abs(Math.round(n)))}`;

const STATUS_CHIP: Record<PayRunStatus, { n: string; cls: string; Icon: typeof Clock3 }> = {
  draft: { n: 'Hisoblanmoqda', cls: CHIP_NEUTRAL, Icon: Clock3 },
  review: { n: 'Tekshirilmoqda', cls: CHIP_INFO, Icon: Clock3 },
  approved: { n: 'Tasdiqlangan', cls: CHIP_OK, Icon: Lock },
  paid: { n: 'To‘langan', cls: CHIP_OK, Icon: CheckCircle2 },
};

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
  status,
  history,
  advances,
  isSelf,
}: {
  line: PayLine | null;
  period: string;
  status: PayRunStatus;
  history: MonthPoint[];
  advances: AdvanceRequest[] | null;
  isSelf: boolean;
}) {
  const chip = STATUS_CHIP[status];
  const pct = line && line.payable > 0 ? Math.min(100, Math.round((line.paid / line.payable) * 100)) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-4 p-5')}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-au-muted">To‘lanadi</span>
            <span className="text-3xl font-bold tracking-tight tabular-nums">
              <CountUp value={som(line?.payable ?? 0)} /> <span className="text-base font-semibold text-au-muted">so‘m</span>
            </span>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={chip.cls}>
              <chip.Icon className="size-3" /> {chip.n}
            </span>
            {line && (
              <button
                onClick={() => downloadPayslips([line], period, PAY_RUN_STEP[status].n)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-au-muted hover:text-au-ink"
              >
                <FileDown className="size-3.5" /> Hisob varaqasi (PDF)
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="h-2 overflow-hidden rounded-full bg-au-card-2">
            <i className="ms-fill block h-full rounded-full bg-au-ok" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-xs text-au-muted">
            <span>
              To‘langan <b className="text-au-ink tabular-nums">{som(line?.paid ?? 0)}</b>
            </span>
            <span>
              Qoldiq{' '}
              <b className={cn('tabular-nums', (line?.remaining ?? 0) > 0 ? 'text-au-accent-text' : (line?.remaining ?? 0) < 0 ? 'text-au-bad' : 'text-au-ink')}>
                {som(line?.remaining ?? 0)}
              </b>
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide text-au-muted uppercase">Qayerdan yig‘ildi</h3>
          {!line || line.components.length === 0 ? (
            <p className="text-sm text-au-muted">Bu oy uchun hali hisob yo‘q</p>
          ) : (
            <ul className="flex flex-col divide-y divide-au-line rounded-au-ctl border border-au-line">
              {line.components.map((c, i) => (
                <li key={i} style={{ ['--i' as string]: i }} className="ms-rise flex items-center justify-between gap-3 px-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-semibold">{COMPONENT_LABEL[c.kind]}</span>
                    {c.kind !== 'base' && <span className="truncate text-[11px] text-au-muted">{c.title}</span>}
                  </div>
                  <span className={cn('shrink-0 font-bold tabular-nums', c.kind === 'base' ? '' : c.amount >= 0 ? 'text-au-ok' : 'text-au-bad')}>
                    {c.kind === 'base' ? som(c.amount) : signed(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {line && line.payments.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-bold tracking-wide text-au-muted uppercase">To‘lovlar</h3>
            {line.payments.map((p) => (
              <div key={p.id} className="flex justify-between text-sm">
                <span>
                  {p.kind === 'advance' ? 'Avans' : 'Oylik'} <span className="text-[11px] text-au-muted">{p.at?.slice(0, 10)}</span>
                </span>
                <span className="tabular-nums">{som(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <section className={cn(SURFACE_CARD, 'ms-rise flex flex-col gap-3 p-4')} style={{ ['--i' as string]: 1 }}>
          <h3 className={CARD_TITLE}>12 oy</h3>
          <MonthBars points={history} current={period} />
        </section>
        {isSelf && advances && <AdvancePanel advances={advances} />}
      </aside>
    </div>
  );
}

function AdvancePanel({ advances }: { advances: AdvanceRequest[] }) {
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
      <h3 className={cn(CARD_TITLE, 'flex items-center gap-2')}>
        <HandCoins className="size-4 text-au-muted" /> Avans
      </h3>
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
