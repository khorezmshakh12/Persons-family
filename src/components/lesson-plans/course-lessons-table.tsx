'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Lock } from 'lucide-react';
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

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

export function CourseLessonsTable({
  groupId,
  lessons,
  monthKey,
  locked = false,
  canEditContent,
  canDeleteFiles,
  canComment,
  currentUserId,
  viewerName,
}: {
  groupId: string;
  lessons: CourseLessonRow[];
  /** 'YYYY-MM'. Set for every month other than the current one: the table
   * then renders folded away behind a month header that opens on click. The
   * current month has no key and is always open. */
  monthKey?: string;
  /** The month is over: nothing in it can be written by anyone (see
   * lessonWriteDenial in actions/course-lessons.ts, which enforces the same
   * rule server-side for the CEO too). Every cell renders as static text. */
  locked?: boolean;
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
  const collapsible = Boolean(monthKey);
  const [open, setOpen] = useState(false);
  const expanded = !collapsible || open;

  // A locked month overrides every role permission at once rather than each
  // caller having to remember to zero them out — the read-only rendering the
  // cells already have for a non-owner is exactly what's wanted here.
  const rowCanEdit = canEditContent && !locked;
  const rowCanDelete = canDeleteFiles && !locked;
  const rowCanComment = canComment && !locked;

  const monthLabel = monthKey
    ? `${t(`months.${MONTH_NAMES[Number(monthKey.slice(5, 7)) - 1]}`)} ${monthKey.slice(0, 4)}`
    : null;

  // Only reachable for the current month (a past/future month bucket exists
  // precisely because it has rows) — a group whose slots have all rolled
  // into past months until the next generation run.
  if (!collapsible && lessons.length === 0) {
    return (
      <div className={cn(GLASS_CARD, 'px-4 py-6 text-sm text-white/50 italic')}>
        {t('courseLessons.noLessonsThisMonth')}
      </div>
    );
  }

  return (
    <div className={cn(GLASS_CARD, 'overflow-hidden')}>
      {collapsible && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-white/85 transition-colors hover:bg-white/[0.06]"
        >
          <ChevronDown className={cn('size-4 shrink-0 transition-transform', expanded && 'rotate-180')} />
          <span>{monthLabel}</span>
          <span className="text-xs font-normal text-white/45">({lessons.length})</span>
          {locked && (
            <span className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/55">
              <Lock className="size-3" />
              {t('courseLessons.readOnly')}
            </span>
          )}
        </button>
      )}
      {expanded && (
        <div className={cn('overflow-x-auto', collapsible && 'border-t border-white/10')}>
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
                  locked={locked}
                  canEditContent={rowCanEdit}
                  canDeleteFiles={rowCanDelete}
                  canComment={rowCanComment}
                  currentUserId={currentUserId}
                  viewerName={viewerName}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
