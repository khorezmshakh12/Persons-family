import { getLocale, getTranslations } from 'next-intl/server';
import { Crown, Trophy } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { StarIcon } from '@/components/ui/star-icon';
import type { MonthTopPerson } from '@/lib/aurora-dashboard';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

/** "Last month's top 3 at Persons" — on every dashboard for the whole
 * following month (see loadLastMonthTop3). Podium order 2 · 1 · 3. */
export async function MonthTop3({ month, people, viewerId }: { month: string; people: MonthTopPerson[]; viewerId: string }) {
  if (people.length === 0) return null;
  const t = await getTranslations('monthTop3');
  const locale = await getLocale();
  const monthName = new Date(`${month}T12:00:00Z`).toLocaleDateString(locale === 'uz' ? 'uz-Latn' : locale, { month: 'long', timeZone: 'UTC' });
  const mine = people.find((p) => p.id === viewerId);
  const podium = [people[1], people[0], people[2]];

  return (
    <section className={cn(SURFACE_CARD, 'au-highlight relative overflow-hidden p-5 sm:p-6')} aria-label={t('title', { month: monthName })}>
      <span aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-[radial-gradient(circle,var(--au-accent-soft),transparent_70%)]" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
        <div className="md:w-[42%]">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.06em] text-au-accent-text uppercase">
            <Trophy className="size-4" strokeWidth={1.75} aria-hidden /> {t('eyebrow')}
          </div>
          <h2 className="mt-1.5 text-[22px] leading-tight font-bold tracking-tight text-au-ink sm:text-[24px]">
            {t('title', { month: monthName })}
          </h2>
          <p className="mt-1.5 text-sm text-au-muted">{mine ? t('youAreIn', { rank: mine.rank }) : t('subtitle', { month: monthName })}</p>
        </div>
        <div className="flex flex-1 items-end justify-center gap-3 sm:gap-5">
          {podium.map((p, i) => {
            if (!p) return <div key={i} className="w-24" />;
            const first = p.rank === 1;
            return (
              <Link key={p.id} href={`/profile/${p.id}`} className="flex w-24 min-w-0 flex-col items-center sm:w-28">
                {first && <Crown className="mb-1 size-5 text-au-accent-text" strokeWidth={1.75} aria-hidden />}
                <span
                  className={cn(
                    'grid place-items-center overflow-hidden rounded-full bg-au-card-2 font-bold text-au-muted',
                    first ? 'size-[72px] text-lg ring-2 ring-au-accent ring-offset-[3px] ring-offset-au-card' : 'size-14 text-base',
                    p.id === viewerId && !first && 'ring-2 ring-au-accent',
                  )}
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={p.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(p.name)
                  )}
                </span>
                <span className="mt-2 max-w-full truncate text-[13px] font-semibold text-au-ink">{p.name}</span>
                <span className="text-xs font-bold text-au-accent-text tabular-nums">{p.stars} <StarIcon className="inline size-3 align-[-1px]" /></span>
                <span
                  className={cn(
                    'mt-2 grid w-full place-items-center rounded-[12px_12px_4px_4px] text-xl font-bold tabular-nums',
                    first ? 'h-16 bg-au-podium text-au-accent-ink shadow-[var(--au-shadow-pop)]' : 'border border-au-line bg-au-card-2 text-au-muted',
                    p.rank === 2 && 'h-11',
                    p.rank === 3 && 'h-8',
                  )}
                >
                  {p.rank}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
