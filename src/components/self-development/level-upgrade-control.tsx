'use client';

import { useActionState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { upgradeTeacherLevelAction, type SelfDevActionState } from '@/lib/actions/self-development';
import { TEACHER_LEVELS, type TeacherLevel } from '@/lib/teacher-level';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function LevelUpgradeControl({ userId, currentLevel }: { userId: string; currentLevel: TeacherLevel }) {
  const t = useTranslations('selfDevelopment');
  const [state, formAction] = useActionState<SelfDevActionState, FormData>(upgradeTeacherLevelAction, undefined);

  useEffect(() => {
    if (state?.success) toast.success(t('levelUpdated'));
    else if (state?.error) toast.error(t(`errors.${state.error}`));
  }, [state, t]);

  function handleChange(value: string | null) {
    if (!value || value === currentLevel) return;
    const formData = new FormData();
    formData.set('userId', userId);
    formData.set('level', value);
    formAction(formData);
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/60">{t('teacherLevel')}</span>
      <Select defaultValue={currentLevel} onValueChange={handleChange}>
        <SelectTrigger className="w-24 border-white/30 bg-white/10 text-white hover:bg-white/20">
          <SelectValue>{(value: string) => value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TEACHER_LEVELS.map((level) => (
            <SelectItem key={level} value={level}>
              {level}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
