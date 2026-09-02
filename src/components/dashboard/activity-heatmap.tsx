import { getFormatter, getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { tashkentYmd, tashkentMidnight, TASHKENT_TZ } from '@/lib/time';

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TASHKENT_TZ });

function intensityClass(count: number, max: number) {
  if (count === 0) return 'bg-white/5 text-white/40';
  const ratio = count / max;
  if (ratio > 0.75) return 'bg-white text-black font-semibold';
  if (ratio > 0.5) return 'bg-white/70 text-black font-semibold';
  if (ratio > 0.25) return 'bg-white/40 text-white';
  return 'bg-white/20 text-white';
}

export async function ActivityHeatmap({
  href,
  large,
  delayMs = 0,
}: {
  href?: string;
  large?: boolean;
  delayMs?: number;
} = {}) {
  const t = await getTranslations('dashboard.activityGrid');
  const format = await getFormatter();

  // Month + "today" in Asia/Tashkent, not the server's UTC clock.
  const { year, month: mm, day: today } = tashkentYmd();
  const month = mm - 1;
  const startOfMonth = tashkentMidnight(`${year}-${String(mm).padStart(2, '0')}-01`);
  const nextY = mm === 12 ? year + 1 : year;
  const nextMm = mm === 12 ? 1 : mm + 1;
  const endOfMonth = tashkentMidnight(`${nextY}-${String(nextMm).padStart(2, '0')}-01`);

  const [rowsA, rowsB] = await Promise.all([
    sql<{ created_at: string }[]>`
      select created_at from staff_chats
      where created_at >= ${startOfMonth.toISOString()} and created_at < ${endOfMonth.toISOString()}
    `,
    sql<{ created_at: string }[]>`
      select created_at from staff_chat_messages
      where created_at >= ${startOfMonth.toISOString()} and created_at < ${endOfMonth.toISOString()}
    `,
  ]);

  const daysInMonth = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  const dayCounts = new Array(daysInMonth + 1).fill(0);
  for (const row of [...rowsA, ...rowsB]) {
    const day = Number(dayFmt.format(new Date(row.created_at)).split('-')[2]);
    dayCounts[day] += 1;
  }
  const maxCount = Math.max(...dayCounts, 1);

  // Monday-first grid, matching the uz/ru convention this app otherwise uses.
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Jan 1 2024 was a Monday — used purely as a stable Monday to read each
  // weekday's locale-correct narrow label off of, in Mon..Sun order.
  const weekdayLabels = Array.from({ length: 7 }, (_, i) =>
    format.dateTime(new Date(2024, 0, 1 + i), { weekday: 'narrow' }),
  );

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <span className="text-xs font-medium text-white/60 capitalize">
          {format.dateTime(new Date(`${year}-${String(mm).padStart(2, '0')}-01T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </span>
      </div>
      <div className={cn('grid grid-cols-7 text-center', large ? 'gap-2' : 'gap-1.5')}>
        {weekdayLabels.map((label, i) => (
          <span key={i} className={cn('font-medium text-white/50', large ? 'text-xs' : 'text-[11px]')}>
            {label}
          </span>
        ))}
        {cells.map((day, i) =>
          day === null ? (
            <span key={i} />
          ) : (
            <span
              key={i}
              style={{ animationDelay: `${delayMs + 120 + i * 10}ms` }}
              className={cn(
                'animate-pop-in flex aspect-square items-center justify-center rounded-md',
                large ? 'text-sm' : 'text-xs',
                intensityClass(dayCounts[day], maxCount),
                day === today && 'ring-2 ring-white/70',
              )}
            >
              {day}
            </span>
          ),
        )}
      </div>
      <p className="text-xs text-white/60">{t('hint')}</p>
    </>
  );

  const cardClassName = cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6', href && GLASS_INTERACTIVE);
  const cardStyle = { animationDelay: `${delayMs}ms` };

  return href ? (
    <Link href={href} style={cardStyle} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div style={cardStyle} className={cardClassName}>
      {content}
    </div>
  );
}
