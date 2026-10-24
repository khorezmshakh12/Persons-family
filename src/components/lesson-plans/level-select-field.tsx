'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COURSE_LEVELS, courseLevel } from '@/lib/course-levels';

/** Guruh darajasi — ketma-ketlik tartibida (1. Beginner … 10. iTEP). */
export function LevelSelectField({ defaultValue }: { defaultValue?: string | null }) {
  const t = useTranslations('lessonPlans');
  const labelFor = (value: string) => {
    const i = COURSE_LEVELS.findIndex((l) => l.slug === value);
    return i < 0 ? t('levelNotSet') : `${i + 1}. ${courseLevel(value)!.label}`;
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="level">{t('level')}</Label>
      <Select name="level" defaultValue={defaultValue ?? 'none'}>
        <SelectTrigger id="level" className="w-full">
          <SelectValue>{(value: string) => labelFor(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t('levelNotSet')}</SelectItem>
          {COURSE_LEVELS.map((l, i) => (
            <SelectItem key={l.slug} value={l.slug}>
              {i + 1}. {l.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
