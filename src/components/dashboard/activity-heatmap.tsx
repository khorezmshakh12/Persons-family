import { getFormatter, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

function intensityClass(count: number, max: number) {
  if (count === 0) return 'bg-white/5 text-white/40';
  const ratio = count / max;
  if (ratio > 0.75) return 'bg-teal-400 text-slate-900 font-semibold';
  if (ratio > 0.5) return 'bg-teal-400/70 text-white font-semibold';
  if (ratio > 0.25) return 'bg-teal-400/40 text-white';
  return 'bg-teal-400/20 text-white';
}

export async function ActivityHeatmap({ href, large }: { href?: string; large?: boolean } = {}) {
  const t = await getTranslations('dashboard.activityGrid');
  const format = await getFormatter();
  const supabase = await createClient();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 1);

  const [{ data: rowsA }, { data: rowsB }] = await Promise.all([
    supabase
      .from('staff_chats')
      .select('created_at')
      .gte('created_at', startOfMonth.toISOString())
      .lt('created_at', endOfMonth.toISOString()),
    supabase
      .from('staff_chat_messages')
      .select('created_at')
      .gte('created_at', startOfMonth.toISOString())
      .lt('created_at', endOfMonth.toISOString()),
  ]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayCounts = new Array(daysInMonth + 1).fill(0);
  for (const row of [...(rowsA ?? []), ...(rowsB ?? [])]) {
    const d = new Date(row.created_at);
    dayCounts[d.getDate()] += 1;
  }
  const maxCount = Math.max(...dayCounts, 1);

  // Monday-first grid, matching the uz/ru convention this app otherwise uses.
  const firstWeekday = (startOfMonth.getDay() + 6) % 7;
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

  const today = now.getDate();

  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <span className="text-xs font-medium text-white/60 capitalize">
          {format.dateTime(now, { month: 'long', year: 'numeric' })}
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
              className={cn(
                'flex aspect-square items-center justify-center rounded-md',
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

  const cardClassName = cn(GLASS_CARD, 'flex flex-col gap-4 p-6', href && GLASS_INTERACTIVE);

  return href ? (
    <Link href={href} className={cardClassName}>
      {content}
    </Link>
  ) : (
    <div className={cardClassName}>{content}</div>
  );
}
