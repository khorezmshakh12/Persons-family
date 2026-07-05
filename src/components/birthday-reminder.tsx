'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export function BirthdayReminder({ names, todayKey }: { names: string[]; todayKey: string }) {
  const t = useTranslations('birthday');

  useEffect(() => {
    if (names.length === 0) return;

    const storageKey = `birthday-reminder-shown-${todayKey}`;
    if (sessionStorage.getItem(storageKey)) return;
    sessionStorage.setItem(storageKey, '1');

    const message =
      names.length === 1
        ? t('reminderSingle', { name: names[0] })
        : t('reminderMultiple', { names: names.join(', ') });

    toast(message, { icon: '🎂', duration: 8000 });
  }, [names, todayKey, t]);

  return null;
}
