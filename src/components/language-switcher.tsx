'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  ru: 'Русский',
  uz: 'O‘zbekcha',
};

export function LanguageSwitcher() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function onChange(nextLocale: string | null) {
    if (!nextLocale) return;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <Select defaultValue={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-[140px]" aria-label={t('language')}>
        <SelectValue>{(value: string) => LOCALE_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            {LOCALE_LABELS[l]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
