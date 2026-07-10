import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

/** Average ceo_score across all staff for the given calendar month
 * (year/monthIndex, 0-based), or null if nobody was scored that month. */
function averageForMonth(rows: { month: string; ceo_score: number | null }[], year: number, monthIndex: number) {
  const scores = rows
    .filter((r) => {
      const d = new Date(r.month);
      return d.getUTCFullYear() === year && d.getUTCMonth() === monthIndex && r.ceo_score !== null;
    })
    .map((r) => r.ceo_score as number);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export async function EmployeeGrowthIndicator({ href }: { href?: string } = {}) {
  const t = await getTranslations('dashboard.employeeGrowth');
  const supabase = await createClient();

  const { data } = await supabase.from('self_development').select('month, ceo_score');
  const rows = data ?? [];

  const now = new Date();
  const thisMonthAvg = averageForMonth(rows, now.getUTCFullYear(), now.getUTCMonth());
  const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthAvg = averageForMonth(rows, prevDate.getUTCFullYear(), prevDate.getUTCMonth());

  const hasData = thisMonthAvg !== null && prevMonthAvg !== null;
  const changePercent = hasData && prevMonthAvg! > 0 ? Math.round(((thisMonthAvg! - prevMonthAvg!) / prevMonthAvg!) * 100) : 0;
  const isPositive = changePercent >= 0;

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        {hasData && (
          <span
            className={cn(
              'flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white',
              isPositive ? 'bg-emerald-500/90' : 'bg-red-500/85',
            )}
          >
            {isPositive ? '↗' : '↘'} {Math.abs(changePercent)}%
          </span>
        )}
      </div>

      {hasData ? (
        <>
          <p className="text-2xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
            {thisMonthAvg!.toFixed(1)}
            <span className="ml-2 text-sm font-normal text-white/60">{t('avgScore')}</span>
          </p>
          <p className="text-xs text-white/50">{t('comparedToLastMonth', { score: prevMonthAvg!.toFixed(1) })}</p>
        </>
      ) : (
        <p className="text-sm text-white/70">{t('noData')}</p>
      )}
    </>
  );

  const cardClassName = cn(GLASS_CARD, 'flex flex-col gap-4 p-6', href && GLASS_INTERACTIVE);

  return href ? (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}
