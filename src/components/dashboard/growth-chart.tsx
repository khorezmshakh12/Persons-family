import { getFormatter, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { monthlyBuckets, momChangePercent } from '@/lib/dashboard-stats';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const MONTHS = 6;
const PADDING = 8;

export async function GrowthChart({ href, large }: { href?: string; large?: boolean } = {}) {
  const t = await getTranslations('dashboard.growthChart');
  const format = await getFormatter();
  const supabase = await createClient();

  const WIDTH = large ? 360 : 280;
  const HEIGHT = large ? 140 : 100;

  const { data } = await supabase.from('profiles').select('created_at').eq('is_active', true);
  const buckets = monthlyBuckets((data ?? []).map((r) => r.created_at), MONTHS);
  const changePercent = momChangePercent(buckets);
  const isPositive = changePercent >= 0;

  const max = Math.max(...buckets, 1);
  const stepX = (WIDTH - PADDING * 2) / (MONTHS - 1);
  const points = buckets.map((v, i) => ({
    x: PADDING + i * stepX,
    y: HEIGHT - PADDING - (v / max) * (HEIGHT - PADDING * 2),
  }));

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${HEIGHT} L ${points[0].x} ${HEIGHT} Z`;

  const now = new Date();
  const monthLabels = buckets.map((_, i) =>
    format.dateTime(new Date(now.getFullYear(), now.getMonth() - (MONTHS - 1 - i), 1), { month: 'short' }),
  );

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <span
          className={cn(
            'flex items-center gap-0.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white',
            isPositive ? 'bg-emerald-500/90' : 'bg-red-500/85',
          )}
        >
          {isPositive ? '↗' : '↘'} {Math.abs(changePercent)}%
        </span>
      </div>

      <p className="text-2xl font-bold tabular-nums text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
        {buckets[buckets.length - 1]}
        <span className="ml-2 text-sm font-normal text-white/60">{t('newThisMonth')}</span>
      </p>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={cn('w-full', large ? 'h-36' : 'h-24')}>
        <defs>
          <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#growthFill)" />
        <path d={linePath} fill="none" stroke="#2dd4bf" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#2dd4bf" />
        ))}
      </svg>

      <div className="flex justify-between text-[11px] text-white/50">
        {monthLabels.map((label, i) => (
          <span key={i} className="capitalize">
            {label}
          </span>
        ))}
      </div>
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
