import { cn } from '@/lib/utils';
import type { TeacherLevel } from '@/lib/teacher-level';

const LEVEL_TINT: Record<string, string> = {
  C: 'bg-gray-500/20 text-au-ink',
  'C+': 'bg-gray-500/20 text-au-ink',
  'C++': 'bg-gray-500/20 text-au-ink',
  B: 'bg-blue-500/20 text-blue-700',
  'B+': 'bg-blue-500/20 text-blue-700',
  'B++': 'bg-blue-500/20 text-blue-700',
  A: 'bg-emerald-500/20 text-emerald-700',
  'A+': 'bg-emerald-500/20 text-emerald-700',
  'A++': 'bg-emerald-500/20 text-emerald-700',
};

export function TeacherLevelBadge({ level, className }: { level: TeacherLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold',
        LEVEL_TINT[level] ?? 'bg-au-card-2 text-au-ink',
        className,
      )}
    >
      {level}
    </span>
  );
}
