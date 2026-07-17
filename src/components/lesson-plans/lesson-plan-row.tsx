'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LessonDateCell } from './lesson-date-cell';
import { LessonTopicCell } from './lesson-topic-cell';
import { LessonGameLinkCell } from './lesson-game-link-cell';
import { LessonFilesCell } from './lesson-files-cell';
import { LessonCommentsDrawer } from './lesson-comments-drawer';
import { LessonPlanTextField } from './lesson-plan-text-field';
import { LessonProcedureTable } from './lesson-procedure-table';
import type { CourseLessonRow } from './course-lessons-table';

function PlanFieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-semibold tracking-wider text-white/55 uppercase">{label}</h4>
      {children}
    </div>
  );
}

export function LessonPlanRow({
  groupId,
  lesson,
  canEditContent,
  canDeleteFiles,
  canComment,
  currentUserId,
  viewerName,
}: {
  groupId: string;
  lesson: CourseLessonRow;
  canEditContent: boolean;
  canDeleteFiles: boolean;
  canComment: boolean;
  currentUserId: string;
  viewerName: string;
}) {
  const t = useTranslations('lessonPlans');
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b border-white/10 transition-colors last:border-b-0 hover:bg-white/[0.06]">
        <td className="px-4 py-3.5 align-top font-semibold text-white/85">
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-white/10 text-xs">
            {lesson.lesson_number}
          </span>
        </td>
        <td className="px-4 py-3.5 align-top">
          <LessonDateCell lessonId={lesson.id} lessonDate={lesson.lesson_date} canEdit={canEditContent} />
        </td>
        <td className="px-4 py-3.5 align-top">
          <LessonTopicCell lessonId={lesson.id} topic={lesson.topic} canEdit={canEditContent} />
        </td>
        <td className="px-4 py-3.5 align-top">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-1.5 rounded-full border border-teal-300/40 bg-teal-400/15 px-3 py-1.5 text-[11px] font-medium text-teal-200 transition-colors hover:bg-teal-400/25"
          >
            {t('courseLessons.planButton')}
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </td>
        <td className="px-4 py-3.5 align-top">
          <LessonGameLinkCell lessonId={lesson.id} gameLink={lesson.game_link} canEdit={canEditContent} />
        </td>
        <td className="px-4 py-3.5 align-top">
          <LessonFilesCell
            lessonId={lesson.id}
            groupId={groupId}
            attachments={lesson.attachments}
            canUpload={canEditContent}
            canDelete={canDeleteFiles}
          />
        </td>
        <td className="px-4 py-3.5 align-top">
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
      {expanded && (
        <tr className="border-b border-white/10 bg-black/20 last:border-b-0">
          <td colSpan={7} className="px-5 py-5">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2">
                <PlanFieldBlock label={t('courseLessons.aim')}>
                  <LessonPlanTextField
                    lessonId={lesson.id}
                    field="aim"
                    value={lesson.aim}
                    canEdit={canEditContent}
                    placeholder={t('courseLessons.aimPlaceholder')}
                  />
                </PlanFieldBlock>
                <PlanFieldBlock label={t('courseLessons.languageFocus')}>
                  <LessonPlanTextField
                    lessonId={lesson.id}
                    field="language_focus"
                    value={lesson.language_focus}
                    canEdit={canEditContent}
                    placeholder={t('courseLessons.languageFocusPlaceholder')}
                  />
                </PlanFieldBlock>
                <PlanFieldBlock label={t('courseLessons.anticipatedProblems')}>
                  <LessonPlanTextField
                    lessonId={lesson.id}
                    field="anticipated_problems"
                    value={lesson.anticipated_problems}
                    canEdit={canEditContent}
                    placeholder={t('courseLessons.anticipatedProblemsPlaceholder')}
                  />
                </PlanFieldBlock>
                <PlanFieldBlock label={t('courseLessons.materials')}>
                  <LessonPlanTextField
                    lessonId={lesson.id}
                    field="materials"
                    value={lesson.materials}
                    canEdit={canEditContent}
                    placeholder={t('courseLessons.materialsPlaceholder')}
                  />
                </PlanFieldBlock>
              </div>
              <PlanFieldBlock label={t('courseLessons.homework')}>
                <LessonPlanTextField
                  lessonId={lesson.id}
                  field="homework"
                  value={lesson.homework}
                  canEdit={canEditContent}
                  placeholder={t('courseLessons.homeworkPlaceholder')}
                />
              </PlanFieldBlock>
              <div className="flex flex-col gap-2">
                <h4 className="text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                  {t('courseLessons.procedure')}
                </h4>
                <LessonProcedureTable lessonId={lesson.id} steps={lesson.procedure} canEdit={canEditContent} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
