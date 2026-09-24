import { getLocale, getTranslations } from 'next-intl/server';
import { Wallet } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { CARD_LINK, CARD_TITLE, SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { FinanceSnapshot } from '@/lib/aurora-dashboard';
import { FinanceFigures } from './finance-figures';

/**
 * Dashboard Finance card ("Moliya kartasi" — took the task-status card's
 * place). CEO: this Tashkent month's team payroll; anyone else: their own
 * salary for the month. Figures come from lib/payroll.ts via
 * loadFinanceSnapshot, the same source /finance and the profile use.
 */
export async function FinanceCard({
  data,
  href,
  className,
}: {
  data: FinanceSnapshot | null;
  href: string;
  className?: string;
}) {
  const t = await getTranslations('aurora');
  const tp = await getTranslations('finance.payroll');
  const ts = await getTranslations('dashboard.stats');
  const locale = await getLocale();

  if (!data) {
    return (
      <section className={cn(SURFACE_CARD, 'flex flex-col p-5', className)}>
        <h2 className={CARD_TITLE}>{ts('finance')}</h2>
        <p className="py-10 text-center text-sm text-au-muted">{t('noData')}</p>
      </section>
    );
  }

  const month = new Date(`${data.period}T00:00:00Z`).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });
  const pct = data.gross > 0 ? Math.min(100, Math.max(0, Math.round((data.paid / data.gross) * 100))) : 0;
  const company = data.scope === 'company';

  return (
    <section className={cn(SURFACE_CARD, 'enter-rise relative flex flex-col overflow-hidden p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-au-accent-soft text-au-accent-text">
            <Wallet className="size-[15px]" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className={cn(CARD_TITLE, 'first-letter:uppercase')}>{t('financeTitle', { month })}</h2>
            <p className="truncate text-xs text-au-muted">{company ? t('financeCompanySub') : t('financeSelfSub')}</p>
          </div>
        </div>
        <Link href={href} className={cn(CARD_LINK, 'shrink-0')}>
          {t('details')}
        </Link>
      </div>

      <FinanceFigures
        headline={data.gross}
        headlineCaption={`${tp('gross')} · UZS`}
        figures={[
          { label: tp('gross'), value: data.gross },
          { label: tp('paid'), value: data.paid, tone: 'ok' },
          { label: tp('remaining'), value: data.remaining, tone: data.remaining > 0 ? 'accent' : 'muted' },
        ]}
      />

      <div className="mt-auto pt-4">
        <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-au-muted">
          <span>{t('finPaidShare', { pct })}</span>
          {company && typeof data.staffCount === 'number' && <span>{t('finStaff', { count: data.staffCount })}</span>}
        </div>
        <div
          className="h-2.5 overflow-hidden rounded-full bg-au-card-2"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full rounded-full bg-au-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </section>
  );
}
