'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type TeacherOption = { id: string; first_name: string; last_name: string };

export function GroupFilters({ teachers }: { teachers: TeacherOption[] }) {
  const t = useTranslations('lessonPlans');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const days = searchParams.get('days') ?? 'all';
  const teacherId = searchParams.get('teacher') ?? 'all';

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={days} onValueChange={(v) => v && updateParam('days', v)}>
        <SelectTrigger className="w-44 border-white/30 bg-white/10 text-white hover:bg-white/20">
          <SelectValue>
            {(value: string) => (value === 'all' ? t('filters.allDays') : t(`scheduleType.${value}`))}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allDays')}</SelectItem>
          <SelectItem value="odd">{t('scheduleType.odd')}</SelectItem>
          <SelectItem value="even">{t('scheduleType.even')}</SelectItem>
        </SelectContent>
      </Select>

      {teachers.length > 0 && (
        <Select value={teacherId} onValueChange={(v) => v && updateParam('teacher', v)}>
          <SelectTrigger className="w-52 border-white/30 bg-white/10 text-white hover:bg-white/20">
            <SelectValue>
              {(value: string) => {
                if (value === 'all') return t('filters.allTeachers');
                const teacher = teachers.find((tch) => tch.id === value);
                return teacher ? `${teacher.first_name} ${teacher.last_name}` : value;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.allTeachers')}</SelectItem>
            {teachers.map((teacher) => (
              <SelectItem key={teacher.id} value={teacher.id}>
                {teacher.first_name} {teacher.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
