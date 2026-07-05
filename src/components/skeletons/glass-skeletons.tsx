import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

/** Pulsing frosted block — the glassmorphism-styled equivalent of the
 * shadcn `Skeleton` primitive (`bg-muted` reads wrong over a photo backdrop). */
function GlassBar({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-white/15', className)} />;
}

/** Matches the shape of a single dashboard card (CompanyNewsCard, WeeklyProgressCard). */
export function GlassCardSkeleton() {
  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <GlassBar className="h-5 w-32" />
      <div className="flex flex-col gap-3">
        <GlassBar className="h-4 w-full" />
        <GlassBar className="h-4 w-5/6" />
        <GlassBar className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Matches a GLASS_CARD-wrapped table (StaffTable, TeamResultsTable). */
export function GlassTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-4')}>
      <GlassBar className="h-4 w-full max-w-xs" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <GlassBar className="size-8 shrink-0 rounded-full" />
            <GlassBar className="h-4 flex-1" />
            <GlassBar className="h-4 w-20 shrink-0" />
            <GlassBar className="h-4 w-24 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches the lesson-plans group-card grid. */
export function GlassGroupGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(GLASS_CARD, 'flex flex-col gap-3 p-5')}>
          <GlassBar className="h-5 w-2/3" />
          <GlassBar className="h-3.5 w-1/2" />
          <GlassBar className="h-3.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}
