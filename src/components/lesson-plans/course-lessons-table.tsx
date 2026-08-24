'use client';

import { useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { LessonPlanRow } from './lesson-plan-row';
import type { LessonAttachmentWithUrl } from './lesson-files-cell';
import type { LessonComment } from './lesson-comments-drawer';
import type { LessonProcedureStep } from '@/lib/actions/course-lessons';

export type CourseLessonRow = {
  id: string;
  lesson_number: number;
  lesson_date: string | null;
  topic: string | null;
  game_link: string | null;
  aim: string | null;
  language_focus: string | null;
  anticipated_problems: string | null;
  materials: string | null;
  homework: string | null;
  procedure: LessonProcedureStep[];
  attachments: LessonAttachmentWithUrl[];
  comments: LessonComment[];
  /** Set once this lesson's content has been moved to another date — see
   * moveLessonPlanAction. `movedToDate` is that destination's own date, for
   * display; the row's own content fields are empty in this state. */
  movedToDate: string | null;
  /** Set when this row received another lesson's content via a move. */
  movedFromDate: string | null;
  moveReason: string | null;
};

export function CourseLessonsTable({
  groupId,
  lessons,
  canEditContent,
  canDeleteFiles,
  canComment,
  currentUserId,
  viewerName,
}: {
  groupId: string;
  lessons: CourseLessonRow[];
  /** Only the owning teacher sets dates/topics/uploads new files. */
  canEditContent: boolean;
  /** The owning teacher or the CEO can remove an existing file. */
  canDeleteFiles: boolean;
  /** CEO/Admin/assistant can comment; the owning teacher reads but doesn't post. */
  canComment: boolean;
  currentUserId: string;
  viewerName: string;
}) {
  const t = useTranslations('lessonPlans');

  return (
    <div className={cn(GLASS_CARD, 'overflow-hidden')}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/15">
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.lessonNumber')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.date')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.topic')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.description')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.gameLink')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.files')}
              </th>
              <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                {t('courseLessons.comments')}
              </th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <LessonPlanRow
                key={lesson.id}
                groupId={groupId}
                lesson={lesson}
                canEditContent={canEditContent}
                canDeleteFiles={canDeleteFiles}
                canComment={canComment}
                currentUserId={currentUserId}
                viewerName={viewerName}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
