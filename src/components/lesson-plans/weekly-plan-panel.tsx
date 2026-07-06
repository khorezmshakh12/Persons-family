import { getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { EditDayDialog } from './edit-day-dialog';
import { DayComments, type Comment, type CommentRole } from './day-comments';
import type { Weekday } from '@/lib/weekly-plan';

export type DayWithComments = {
  id: string;
  weekday: Weekday;
  topic: string | null;
  notes: string | null;
  comments: Comment[];
};

export async function WeeklyPlanPanel({
  days,
  canEdit,
  currentUserId,
  viewerName,
  viewerRole,
  canComment,
}: {
  days: DayWithComments[];
  canEdit: boolean;
  currentUserId: string;
  viewerName: string;
  viewerRole: CommentRole | 'teacher';
  canComment: boolean;
}) {
  const t = await getTranslations('lessonPlans');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {days.map((day) => (
        <div key={day.id} className={cn(GLASS_CARD, 'flex flex-col gap-3 p-4')}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold tracking-wide text-teal-300 uppercase">
                {t(`weekdays.${day.weekday}`)}
              </span>
              {day.topic ? (
                <span className="text-sm font-semibold">{day.topic}</span>
              ) : (
                <span className="text-sm text-white/40 italic">{t('noTopic')}</span>
              )}
              {day.notes && <span className="text-xs text-white/60">{day.notes}</span>}
            </div>
            {canEdit && (
              <EditDayDialog
                dayId={day.id}
                weekdayLabel={t(`weekdays.${day.weekday}`)}
                topic={day.topic}
                notes={day.notes}
              />
            )}
          </div>
          <div className="border-t border-white/15 pt-2">
            <DayComments
              dayId={day.id}
              comments={day.comments}
              currentUserId={currentUserId}
              viewerName={viewerName}
              viewerRole={viewerRole}
              canComment={canComment}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
