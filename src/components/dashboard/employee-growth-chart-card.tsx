'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { getTeacherSelfDevelopmentAction } from '@/lib/actions/self-development';
import { SelfDevelopmentLineChart } from '@/components/self-development/self-development-line-chart';
import type { ScorePoint } from '@/components/self-development/self-development-chart';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type TeacherOption = { id: string; first_name: string; last_name: string };

export function EmployeeGrowthChartCard({
  teachers,
  initialTeacherId,
  initialPoints,
}: {
  teachers: TeacherOption[];
  initialTeacherId: string | null;
  initialPoints: ScorePoint[];
}) {
  const t = useTranslations('dashboard.employeeGrowth');
  const [selectedId, setSelectedId] = useState(initialTeacherId);
  const [points, setPoints] = useState(initialPoints);
  const [isPending, startTransition] = useTransition();

  function handleSelect(teacherId: string) {
    setSelectedId(teacherId);
    startTransition(async () => {
      setPoints(await getTeacherSelfDevelopmentAction(teacherId));
    });
  }

  if (teachers.length === 0) {
    return (
      <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <p className="text-sm text-white/70">{t('noTeachers')}</p>
      </div>
    );
  }

  const selected = teachers.find((tch) => tch.id === selectedId);

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <Select value={selectedId ?? undefined} onValueChange={(v) => v && handleSelect(v)}>
          <SelectTrigger className="w-44 border-white/30 bg-white/10 text-white hover:bg-white/20">
            <SelectValue>
              {() => (selected ? `${selected.first_name} ${selected.last_name}` : t('selectTeacher'))}
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
      </div>

      <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <SelfDevelopmentLineChart points={points} bare />
      </div>
    </div>
  );
}
