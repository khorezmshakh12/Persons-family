'use client';

import { useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function YearSwitcher({
  currentYear,
  availableYears,
}: {
  currentYear: number;
  availableYears: number[];
}) {
  const t = useTranslations('incomeRoadmap');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Ensure current shown year and available years are unique and sorted descending
  const years = Array.from(new Set([currentYear, ...availableYears])).sort((a, b) => b - a);

  function handleYearChange(newYearStr: string | null) {
    if (!newYearStr) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('incomeYear', newYearStr);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-white/60">{t('year')}:</span>
      <Select
        value={String(currentYear)}
        onValueChange={handleYearChange}
        disabled={isPending}
      >
        <SelectTrigger className="h-8 w-24 border-white/20 bg-white/10 text-xs font-semibold text-white backdrop-blur-md hover:bg-white/15">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-white/20 bg-slate-900/95 text-white backdrop-blur-xl">
          {years.map((y) => (
            <SelectItem key={y} value={String(y)} className="text-xs text-white hover:bg-white/10 focus:bg-white/15">
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
