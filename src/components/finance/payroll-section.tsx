'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  setSalaryMonthAction,
  addFinanceEntryAction,
  type FinanceActionState,
} from '@/lib/actions/finance';
import { shiftPeriod, type PayrollSummary } from '@/lib/payroll';
import { formatUZS } from '@/lib/format-currency';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/staff/currency-input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

function periodLabel(period: string, locale: string) {
  return new Date(`${period}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function PayrollSection({ summary, locale }: { summary: PayrollSummary; locale: string }) {
  const t = useTranslations('finance.payroll');
  const { period, rows, totals } = summary;

  return (
    <section className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-heading text-lg font-semibold text-white">
          <Wallet className="size-5 text-emerald-300" />
          {t('title')}
        </h2>
        <div className="flex items-center gap-1 text-sm text-white/80">
          <Link
            href={`/finance?period=${shiftPeriod(period, -1)}`}
            aria-label={t('prevMonth')}
            className="tap-scale rounded p-1 hover:bg-white/10"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <span className="min-w-[9rem] text-center font-medium capitalize">
            {periodLabel(period, locale)}
          </span>
          <Link
            href={`/finance?period=${shiftPeriod(period, 1)}`}
            aria-label={t('nextMonth')}
            className="tap-scale rounded p-1 hover:bg-white/10"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/15 bg-white/5 p-3 text-center">
        <Figure label={t('totalGross')} value={formatUZS(totals.gross)} />
        <Figure label={t('totalPaid')} value={formatUZS(totals.paid)} tone="text-emerald-300" />
        <Figure
          label={t('totalRemaining')}
          value={formatUZS(totals.remaining)}
          tone={totals.remaining > 0 ? 'text-amber-300' : 'text-white/70'}
        />
      </div>

      <div className="flex flex-col divide-y divide-white/10">
        {rows.map((r) => (
          <div key={r.staffId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="min-w-[8rem] flex-1 font-medium text-white">{r.name}</span>
            <SetSalaryForm staffId={r.staffId} period={period} gross={r.gross} />
            <span className="w-28 text-right text-sm tabular-nums text-emerald-300">
              {formatUZS(r.paid)}
            </span>
            <span
              className={cn(
                'w-28 text-right text-sm font-semibold tabular-nums',
                r.remaining > 0 ? 'text-amber-300' : 'text-white/60',
              )}
            >
              {formatUZS(r.remaining)}
            </span>
            <RecordPaymentDialog staffId={r.staffId} name={r.name} period={period} />
          </div>
        ))}
      </div>
    </section>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-wide text-white/50">{label}</span>
      <span className={cn('text-sm font-bold tabular-nums', tone ?? 'text-white')}>{value}</span>
    </div>
  );
}

function SetSalaryForm({
  staffId,
  period,
  gross,
}: {
  staffId: string;
  period: string;
  gross: number;
}) {
  const t = useTranslations('finance.payroll');
  const [state, formAction, isPending] = useActionState<FinanceActionState, FormData>(
    async (prev, fd) => {
      const res = await setSalaryMonthAction(prev, fd);
      if (res?.error) toast.error(t(`errors.${res.error}`) ?? res.error);
      else toast.success(t('salarySaved'));
      return res;
    },
    undefined,
  );

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="period" value={period} />
      <div className="w-36">
        <CurrencyInput id={`gross-${staffId}`} name="grossAmount" defaultValue={gross} />
      </div>
      <Button type="submit" size="sm" variant="outline" loading={isPending}>
        {t('set')}
      </Button>
      {state?.error && <span className="text-xs text-destructive">!</span>}
    </form>
  );
}

function RecordPaymentDialog({
  staffId,
  name,
  period,
}: {
  staffId: string;
  name: string;
  period: string;
}) {
  const t = useTranslations('finance.payroll');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'salary' | 'advance' | 'penalty'>('salary');

  const [state, formAction, isPending] = useActionState<FinanceActionState, FormData>(
    async (prev, fd) => {
      // A penalty is a deduction: the CEO types a positive figure, it is
      // stored negative so it lowers the net total (and never counts as
      // "paid").
      if (kind === 'penalty') {
        const raw = Number(String(fd.get('amount') ?? '').replace(/[^\d.-]/g, ''));
        if (Number.isFinite(raw) && raw > 0) fd.set('amount', String(-raw));
      }
      const res = await addFinanceEntryAction(prev, fd);
      if (res?.error) {
        toast.error(t(`errors.${res.error}`));
      } else {
        toast.success(t('paymentRecorded'));
        setOpen(false);
      }
      return res;
    },
    undefined,
  );

  const KINDS = ['salary', 'advance', 'penalty'] as const;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="ghost" />}>{t('record')}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('recordFor', { name })} · {name}
          </DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="kind" value={kind} />

          <div className="flex flex-col gap-1.5">
            <Label>{t('kind')}</Label>
            <div className="flex gap-1.5">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'tap-scale rounded-lg border px-3 py-1.5 text-sm',
                    kind === k
                      ? 'border-white/40 bg-white/20 text-white'
                      : 'border-white/15 text-white/60 hover:text-white',
                  )}
                >
                  {t(`kind_${k}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pay-title">{t('note')}</Label>
            <input
              id="pay-title"
              name="title"
              defaultValue={t(`kind_${kind}`)}
              maxLength={200}
              className="h-9 rounded-lg border border-white/20 bg-white/10 px-3 text-sm text-white"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{t('amount')}</Label>
            <CurrencyInput id="pay-amount" name="amount" key={kind} defaultValue={0} />
            <span className="text-xs text-white/50">
              {kind === 'penalty' ? t('penaltyHint') : t('paymentHint')}
            </span>
          </div>

          {state?.error && !state.fieldErrors && (
            <p className="text-sm text-destructive">{t(`errors.${state.error}`) ?? state.error}</p>
          )}

          <DialogFooter>
            <Button type="submit" loading={isPending}>
              {isPending ? tCommon('loading') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
