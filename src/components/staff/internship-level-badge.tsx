import { cn } from '@/lib/utils';
import type { InternshipLevel } from '@/lib/internship-level';

const LEVEL_TINT: Record<InternshipLevel, string> = {
  C: 'bg-gray-500/20 text-gray-200',
  B: 'bg-blue-500/20 text-blue-200',
  A: 'bg-emerald-500/20 text-emerald-200',
};

export function InternshipLevelBadge({ level, className }: { level: InternshipLevel; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold',
        LEVEL_TINT[level],
        className,
      )}
    >
      {level}
    </span>
  );
}
