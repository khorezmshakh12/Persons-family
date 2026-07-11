'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type TeacherOption = { id: string; first_name: string; last_name: string };

export function TeacherPicker({ teachers, selectedId }: { teachers: TeacherOption[]; selectedId: string }) {
  const t = useTranslations('selfDevelopment');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateTeacher(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('teacher', value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={selectedId} onValueChange={(v) => v && updateTeacher(v)}>
      <SelectTrigger className="w-52 border-white/30 bg-white/10 text-white hover:bg-white/20">
        <SelectValue>
          {(value: string) => {
            const teacher = teachers.find((tch) => tch.id === value);
            return teacher ? `${teacher.first_name} ${teacher.last_name}` : t('teacherProgress.selectTeacher');
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {teachers.map((teacher) => (
          <SelectItem key={teacher.id} value={teacher.id}>
            {teacher.first_name} {teacher.last_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
