import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type GroupCardData = {
  id: string;
  name: string;
  course_name: string | null;
  schedule_type: 'odd' | 'even' | null;
  teacher: { first_name: string; last_name: string } | null;
};

const SCHEDULE_TINT: Record<'odd' | 'even', string> = {
  odd: 'bg-orange-500/20 text-orange-200',
  even: 'bg-blue-500/20 text-blue-200',
};

export async function GroupCard({ group }: { group: GroupCardData }) {
  const t = await getTranslations('lessonPlans');

  return (
    <Link href={`/lesson-plans/${group.id}`} className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'flex flex-col gap-2 p-5')}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold text-white">{group.name}</span>
        {group.schedule_type && (
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', SCHEDULE_TINT[group.schedule_type])}>
            {t(`scheduleType.${group.schedule_type}`)}
          </span>
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
