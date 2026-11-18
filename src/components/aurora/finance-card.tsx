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
 * month (given + KPI/bonus − jarima). Figures come from the pay engine via
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
        headlineCaption={`${tp('monthPay')} · UZS`}
        figures={[
          { label: tp('monthPay'), value: data.gross },
          { label: tp('given'), value: data.paid, tone: 'ok' },
          { label: tp('extra'), value: data.extra, tone: data.extra > 0 ? 'ok' : 'muted' },
        ]}
      />

      {company && typeof data.staffCount === 'number' && (
        <div className="mt-auto pt-4 text-xs text-au-muted">{t('finStaff', { count: data.staffCount })}</div>
      )}
    </section>
  );
}
