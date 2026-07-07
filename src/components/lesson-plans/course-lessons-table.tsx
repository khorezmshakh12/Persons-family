'use client';

import { useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { LessonDateCell } from './lesson-date-cell';
import { LessonTopicCell } from './lesson-topic-cell';
import { LessonDescriptionCell } from './lesson-description-cell';
import { LessonGameLinkCell } from './lesson-game-link-cell';
import { LessonFilesCell, type LessonAttachmentWithUrl } from './lesson-files-cell';
import { LessonCommentsDrawer, type LessonComment } from './lesson-comments-drawer';

export type CourseLessonRow = {
  id: string;
  lesson_number: number;
  lesson_date: string | null;
  topic: string | null;
  description: string | null;
  game_link: string | null;
  attachments: LessonAttachmentWithUrl[];
  comments: LessonComment[];
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
    <div className={cn(GLASS_CARD, 'overflow-x-auto')}>
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/15 text-xs tracking-wide text-white/60 uppercase">
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.lessonNumber')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.date')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.topic')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.description')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.gameLink')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.files')}</th>
            <th className="px-3 py-2.5 font-medium">{t('courseLessons.comments')}</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((lesson) => (
            <tr key={lesson.id} className="border-b border-white/10 last:border-b-0 hover:bg-white/5">
              <td className="px-3 py-2.5 align-top font-semibold text-white/85">{lesson.lesson_number}</td>
              <td className="px-3 py-2.5 align-top">
                <LessonDateCell lessonId={lesson.id} lessonDate={lesson.lesson_date} canEdit={canEditContent} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <LessonTopicCell lessonId={lesson.id} topic={lesson.topic} canEdit={canEditContent} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <LessonDescriptionCell lessonId={lesson.id} description={lesson.description} canEdit={canEditContent} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <LessonGameLinkCell lessonId={lesson.id} gameLink={lesson.game_link} canEdit={canEditContent} />
              </td>
              <td className="px-3 py-2.5 align-top">
                <LessonFilesCell
                  lessonId={lesson.id}
                  groupId={groupId}
                  attachments={lesson.attachments}
                  canUpload={canEditContent}
                  canDelete={canDeleteFiles}
                />
              </td>
              <td className="px-3 py-2.5 align-top">
                <LessonCommentsDrawer
                  lessonId={lesson.id}
                  lessonNumber={lesson.lesson_number}
                  comments={lesson.comments}
                  currentUserId={currentUserId}
                  viewerName={viewerName}
                  canComment={canComment}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
