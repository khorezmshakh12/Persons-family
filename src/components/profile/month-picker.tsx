'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations, useFormatter } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function MonthPicker({ months, selected }: { months: string[]; selected: string }) {
  const t = useTranslations('profile.selfDevelopment');
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('month', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function label(value: string) {
    return value === 'all'
      ? t('allMonths')
      : format.dateTime(new Date(`${value}T00:00:00Z`), {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        });
  }

  return (
    <Select value={selected} onValueChange={(v) => v && update(v)}>
      <SelectTrigger className="w-48 border-white/30 bg-white/10 text-white hover:bg-white/20">
        <SelectValue>{(value: string) => label(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t('allMonths')}</SelectItem>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            {label(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
