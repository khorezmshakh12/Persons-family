'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Gamepad2 } from 'lucide-react';
import { updateLessonGameLinkAction } from '@/lib/actions/course-lessons';
import { Input } from '@/components/ui/input';

export function LessonGameLinkCell({
  lessonId,
  gameLink,
  canEdit,
}: {
  lessonId: string;
  gameLink: string | null;
  canEdit: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [value, setValue] = useState(gameLink ?? '');
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === (gameLink ?? '')) return;
    const formData = new FormData();
    formData.set('lessonId', lessonId);
    formData.set('gameLink', value);
    startTransition(async () => {
      const result = await updateLessonGameLinkAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
    });
  }

  if (!canEdit) {
    return gameLink ? (
      <a
        href={gameLink}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-40 items-center gap-1.5 text-xs whitespace-nowrap text-teal-300 hover:text-teal-200 hover:underline"
      >
        <Gamepad2 className="size-3.5 shrink-0" />
        <span className="truncate">{t('courseLessons.openGame')}</span>
      </a>
    ) : (
      <span className="text-xs text-white/40 italic">{t('courseLessons.noGameLink')}</span>
    );
  }

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      disabled={isPending}
      maxLength={500}
      placeholder={t('courseLessons.gameLinkPlaceholder')}
      className="h-8 w-40 rounded-lg border-dashed border-white/25 bg-white/5 text-xs text-white transition-colors placeholder:text-white/40 placeholder:italic focus-visible:border-solid focus-visible:border-teal-300/70 focus-visible:ring-0 disabled:border-solid disabled:bg-white/[0.03] disabled:opacity-70"
    />
  );
}
