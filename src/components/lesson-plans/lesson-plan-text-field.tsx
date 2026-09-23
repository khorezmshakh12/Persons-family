'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateLessonPlanFieldAction } from '@/lib/actions/course-lessons';
import { Textarea } from '@/components/ui/textarea';

export type LessonPlanField = 'aim' | 'language_focus' | 'anticipated_problems' | 'materials' | 'homework';

/** One shared field for the five lesson-plan text columns (aim, language
 * focus, anticipated problems, materials, homework) — same shape as the
 * table's per-cell fields (local value + save-on-blur), just rendered at
 * accordion width instead of table-cell width. */
export function LessonPlanTextField({
  lessonId,
  field,
  value: initialValue,
  canEdit,
  placeholder,
}: {
  lessonId: string;
  field: LessonPlanField;
  value: string | null;
  canEdit: boolean;
  placeholder: string;
}) {
  const t = useTranslations('lessonPlans');
  const [value, setValue] = useState(initialValue ?? '');
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (initialValue ?? '')) return;
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('field', field);
    formData.set('value', value);
    startTransition(async () => {
      const result = await updateLessonPlanFieldAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  if (!canEdit) {
    return (
      <p className={value ? 'text-[13.5px] leading-relaxed text-au-ink' : 'text-[13.5px] text-au-muted italic'}>
        {value || t('courseLessons.notSet')}
      </p>
    );
  }

  return (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={isPending}
      maxLength={4000}
      placeholder={placeholder}
      className="min-h-16 w-full resize-none rounded-lg border-dashed border-au-line bg-au-card-2 text-[13.5px] text-au-ink transition-colors placeholder:text-au-faint placeholder:italic focus-visible:border-solid focus-visible:border-au-accent focus-visible:ring-0 disabled:border-solid disabled:bg-white/[0.03] disabled:opacity-70"
    />
  );
}
