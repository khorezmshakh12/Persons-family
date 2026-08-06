import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type GroupCardData = {
  id: string;
  name: string;
  course_name: string | null;
  schedule_type: 'odd' | 'even' | null;
  teacher: { first_name: string; last_name: string } | null;
};

const SCHEDULE_TINT: Record<'odd' | 'even', 'orange' | 'blue'> = {
  odd: 'orange',
  even: 'blue',
};

export async function GroupCard({
  group,
  index = 0,
}: {
  group: GroupCardData;
  /** Staggers this card's entrance animation behind the ones before it. */
  index?: number;
}) {
  const t = await getTranslations('lessonPlans');

  return (
    <Link
      href={`/lesson-plans/${group.id}`}
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
      className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'animate-fade-in-up flex flex-col gap-2 p-5')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-heading text-lg font-semibold text-white">{group.name}</span>
        {group.schedule_type && (
          <Badge variant="tint" tint={SCHEDULE_TINT[group.schedule_type]} className="shrink-0">
            {t(`scheduleType.${group.schedule_type}`)}
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-1 text-sm text-white/70">
        <span>{group.course_name || t('noCourseName')}</span>
        <span className="text-xs text-white/50">
          {group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : '—'}
        </span>
      </div>
    </Link>
  );
}
