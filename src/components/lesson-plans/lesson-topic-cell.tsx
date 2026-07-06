'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { updateLessonTopicAction } from '@/lib/actions/course-lessons';
import { Textarea } from '@/components/ui/textarea';

export function LessonTopicCell({
  lessonId,
  topic,
  canEdit,
}: {
  lessonId: string;
  topic: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [value, setValue] = useState(topic ?? '');
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (topic ?? '')) return;
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('topic', value);
    startTransition(async () => {
      const result = await updateLessonTopicAction(undefined, formData);
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
      maxLength={2000}
      placeholder={canEdit ? t('courseLessons.topicPlaceholder') : t('courseLessons.noTopic')}
      className="min-h-8 w-56 resize-none border-white/20 bg-white/10 text-xs text-white placeholder:text-white/40 disabled:opacity-70"
    />
  );
}
