'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateLessonDescriptionAction } from '@/lib/actions/course-lessons';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export function LessonDescriptionCell({
  lessonId,
  description,
  canEdit,
}: {
  lessonId: string;
  description: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [value, setValue] = useState(description ?? '');
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (description ?? '')) return;
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('description', value);
    startTransition(async () => {
      const result = await updateLessonDescriptionAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  // Collapsed by default: the Textarea below uses field-sizing-content to
  // auto-grow to fit its value, which used to blow up every row's height to
  // match whichever lesson had the longest description. Collapsing to a
  // clamped, non-editing preview until the cell is explicitly expanded keeps
  // the table's row height stable regardless of content length.
  return (
    <div
      className={cn(
        'w-56 overflow-hidden transition-[max-height] duration-300 ease-in-out',
        expanded ? 'max-h-96' : 'max-h-10',
      )}
    >
      {expanded ? (
        <div className="flex flex-col gap-1.5">
          {canEdit ? (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleBlur}
              disabled={isPending}
              autoFocus
              maxLength={4000}
              placeholder={t('courseLessons.descriptionPlaceholder')}
              className="w-full resize-none border-white/20 bg-white/10 text-xs text-white placeholder:text-white/40 disabled:opacity-70"
            />
          ) : (
            <p className="text-xs whitespace-pre-wrap text-white/80">
              {value || t('courseLessons.noDescription')}
            </p>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="self-start text-[11px] font-medium text-teal-300 hover:text-teal-200"
          >
            {t('courseLessons.showLess')}
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setExpanded(true)} className="block w-full text-left">
          <span
            className={cn('line-clamp-2 text-xs text-white/80', !value && 'text-white/40 italic')}
          >
            {value || (canEdit ? t('courseLessons.descriptionPlaceholder') : t('courseLessons.noDescription'))}
          </span>
          {value && (
            <span className="mt-0.5 block text-[11px] font-medium text-teal-300 hover:text-teal-200">
              {t('courseLessons.readMore')}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
