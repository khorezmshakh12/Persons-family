'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateLessonDescriptionAction } from '@/lib/actions/course-lessons';
import { Textarea } from '@/components/ui/textarea';

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

  return (
    <Textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={!canEdit || isPending}
      rows={1}
      maxLength={4000}
      placeholder={canEdit ? t('courseLessons.descriptionPlaceholder') : t('courseLessons.noDescription')}
      className="min-h-8 w-56 resize-none border-white/20 bg-white/10 text-xs text-white placeholder:text-white/40 disabled:opacity-70"
    />
  );
}
