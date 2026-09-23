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
import { Globe } from 'lucide-react';

// Short codes instead of flag emoji (Aurora rule: no emoji in the UI).
const LOCALE_META: Record<string, { label: string; code: string }> = {
  en: { label: 'English', code: 'EN' },
  ru: { label: 'Русский', code: 'RU' },
  uz: { label: 'O‘zbekcha', code: 'UZ' },
};

export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  /** Topbar variant: 38px control showing just the locale code. */
  compact?: boolean;
}) {
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
      <SelectTrigger
        className={cn(
          compact
            ? 'h-[38px]! w-auto gap-1.5 rounded-au-ctl border-au-line bg-au-card px-2.5 text-[13px] font-semibold text-au-muted'
            : 'w-[150px]',
          className,
        )}
        aria-label={t('language')}
      >
        <SelectValue>
          {(value: string) =>
            compact ? (
              <span className="flex items-center gap-1.5">
                <Globe className="size-4" strokeWidth={1.75} aria-hidden />
                {LOCALE_META[value].code}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-au-muted">{LOCALE_META[value].code}</span>
                {LOCALE_META[value].label}
              </span>
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {routing.locales.map((l) => (
          <SelectItem key={l} value={l}>
            <span className="flex items-center gap-2">
              <span className="w-5 text-xs font-semibold text-au-muted">{LOCALE_META[l].code}</span>
              {LOCALE_META[l].label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
