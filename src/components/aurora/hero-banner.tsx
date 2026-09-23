import type { ReactNode } from 'react';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { ClipboardCheck, ListTodo, ShoppingBag } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { BTN_PRIMARY, BTN_SECONDARY, SURFACE_HERO } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { HeroData } from '@/lib/aurora-dashboard';
import { ProgressRing } from './progress-ring';
import { LiveTashkentTime } from './live-time';

const TZ = 'Asia/Tashkent';

function greetingKey(now: Date): 'morning' | 'day' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

/** Faint concentric apricot rings behind the hero (decoration only). */
function HeroDeco() {
  return (
    <svg
      viewBox="0 0 400 400"
      fill="none"
      stroke="var(--au-accent)"
      aria-hidden
      className="pointer-events-none absolute -right-20 -bottom-[120px] size-[420px] opacity-50"
    >
      <circle cx="200" cy="200" r="80" strokeOpacity=".5" />
      <circle cx="200" cy="200" r="120" strokeOpacity=".35" />
      <circle cx="200" cy="200" r="160" strokeOpacity=".2" />
      <circle cx="200" cy="200" r="198" strokeOpacity=".12" />
    </svg>
  );
}

export async function HeroBanner({
  firstName,
  data,
  showLessonPlans,
  className,
}: {
  firstName: string;
  data: HeroData | null;
  showLessonPlans: boolean;
  className?: string;
}) {
  const t = await getTranslations('aurora');
  const format = await getFormatter();
  const locale = await getLocale();
  const now = new Date();

  const dateLabel = new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const timeLabel = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(now);

  const status = data?.status;
  const pct = status && status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
  const b = (chunks: ReactNode) => <b className="font-semibold text-au-ink">{chunks}</b>;

  return (
    <section className={cn(SURFACE_HERO, 'flex min-h-[252px] flex-col gap-6 px-6 py-6 sm:flex-row sm:px-[30px] sm:py-7', className)}>
      <HeroDeco />
      <div className="relative z-10 flex flex-1 flex-col">
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.02em] text-au-accent-text">
          <span className="size-2 rounded-full bg-au-ok ring-4 ring-au-ok-soft" aria-hidden />
          <span className="first-letter:uppercase">{dateLabel}</span>
          <span aria-hidden>·</span>
          <span>
            {t('tashkent')} <LiveTashkentTime initial={timeLabel} />
          </span>
        </span>
        <h1 className="mt-3 mb-2.5 text-[30px] leading-9 font-bold tracking-[-0.025em] text-au-ink sm:text-[38px] sm:leading-[44px]">
          {t(`greeting.${greetingKey(now)}`)},{' '}
          <em className="font-display text-[38px] font-normal italic sm:text-[46px]">{firstName}</em>
        </h1>
        {data && (
          <p className="max-w-[460px] text-[15px] leading-[23px] text-au-muted">
            {t.rich('summary', {
              tasks: format.number(data.activeTasks),
              dueToday: format.number(data.dueToday),
              stars: `+${format.number(data.teamStarsThisWeek)}`,
              b,
            })}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2.5 pt-[22px]">
          <Link href="/tasks" className={BTN_PRIMARY}>
            <ListTodo className="size-[17px]" strokeWidth={1.75} aria-hidden />
            {t('newTask')}
          </Link>
          {showLessonPlans ? (
            <Link href="/lesson-plans" className={BTN_SECONDARY}>
              <ClipboardCheck className="size-[17px]" strokeWidth={1.75} aria-hidden />
              {t('reviewPlans')}
            </Link>
          ) : (
            <Link href="/market" className={BTN_SECONDARY}>
              <ShoppingBag className="size-[17px]" strokeWidth={1.75} aria-hidden />
              {t('openMarket')}
            </Link>
          )}
        </div>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center sm:w-[230px]">
        <ProgressRing value={pct}>
          <span className="text-[40px] leading-[44px] font-bold tracking-[-0.03em] text-au-ink tabular-nums">
            {status && status.total > 0 ? `${pct}%` : '—'}
          </span>
          <span className="text-xs text-au-muted">{t('monthPlan')}</span>
        </ProgressRing>
        <p className="mt-2 text-center text-[13px] text-au-muted tabular-nums">
          {status && status.total > 0
            ? t.rich('monthPlanCaption', { done: status.done, total: status.total, b })
            : t('noData')}
        </p>
      </div>
    </section>
  );
}
