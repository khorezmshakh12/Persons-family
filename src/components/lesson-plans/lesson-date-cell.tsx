'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateLessonDateAction } from '@/lib/actions/course-lessons';
import { Input } from '@/components/ui/input';

export function LessonDateCell({
  lessonId,
  lessonDate,
  canEdit,
}: {
  lessonId: string;
  lessonDate: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [value, setValue] = useState(lessonDate ?? '');
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (lessonDate ?? '')) return;
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('lessonDate', value);
    startTransition(async () => {
      const result = await updateLessonDateAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <Input
      type="date"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={!canEdit || isPending}
      className="h-8 w-36 border-white/20 bg-white/10 text-xs text-white disabled:opacity-70 [color-scheme:dark]"
    />
  );
}
