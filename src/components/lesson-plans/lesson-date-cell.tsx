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
      className="h-8 w-36 rounded-full border-dashed border-white/25 bg-white/5 px-3 text-xs text-white transition-colors focus-visible:border-solid focus-visible:border-white/70 focus-visible:ring-0 disabled:border-solid disabled:bg-white/[0.03] disabled:opacity-70 [color-scheme:dark]"
    />
  );
}
