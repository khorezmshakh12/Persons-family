import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type GroupCardData = {
  id: string;
  name: string;
  configuration: { subject: string | null; level: string | null; schedule: string | null; room: string | null };
  teacher: { first_name: string; last_name: string } | null;
};

export async function GroupCard({ group, showTeacher }: { group: GroupCardData; showTeacher: boolean }) {
  const t = await getTranslations('lessonPlans');
  const { subject, level, schedule, room } = group.configuration;

  return (
    <Link href={`/lesson-plans/${group.id}`} className={cn(GLASS_CARD, 'flex flex-col gap-2 p-5 transition-all hover:scale-[1.02]')}>
      <span className="text-lg font-semibold">{group.name}</span>
      <div className="flex flex-col gap-1 text-sm text-white/70">
        {(subject || level) && (
          <span>
            {[subject, level].filter(Boolean).join(' · ')}
          </span>
        )}
        {schedule && <span>{schedule}</span>}
        {room && <span>{t('room')}: {room}</span>}
        {showTeacher && group.teacher && (
          <span className="mt-1 text-xs text-white/50">
            {group.teacher.first_name} {group.teacher.last_name}
          </span>
        )}
      </div>
    </Link>
  );
}
