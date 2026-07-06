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
import { cn } from '@/lib/utils';

const LOCALE_META: Record<string, { label: string; flag: string }> = {
  en: { label: 'English', flag: '🇬🇧' },
  ru: { label: 'Русский', flag: '🇷🇺' },
  uz: { label: 'O‘zbekcha', flag: '🇺🇿' },
};

export function LanguageSwitcher({ className }: { className?: string }) {
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
      <SelectTrigger className={cn('w-[150px]', className)} aria-label={t('language')}>
        <SelectValue>
          {(value: string) => (
            <span className="flex items-center gap-2">
              <span>{LOCALE_META[value].flag}</span>
              {LOCALE_META[value].label}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            <span className="flex items-center gap-2">
              <span>{LOCALE_META[l].flag}</span>
              {LOCALE_META[l].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
