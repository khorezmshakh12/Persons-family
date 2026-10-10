import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export function GlassBar({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-white/15', className)} />;
}

/** Complete wireframe skeleton for Dashboard (/dashboard) */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn(GLASS_CARD, 'flex flex-col justify-between p-5')}>
            <div className="flex items-center justify-between">
              <GlassBar className="size-10 rounded-xl" />
              <GlassBar className="h-5 w-16 rounded-full" />
            </div>
            <div className="mt-4">
              <GlassBar className="h-8 w-24" />
              <GlassBar className="mt-2 h-4 w-36" />
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: Left (News & Progress), Right (Leaderboard & Heatmap) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-7">
          {/* Company News Skeleton */}
          <div className={cn(GLASS_CARD, 'p-6')}>
            <div className="flex items-center justify-between mb-4">
              <GlassBar className="h-6 w-48" />
              <GlassBar className="h-4 w-20" />
            </div>
            <GlassBar className="h-28 w-full rounded-xl mb-4" />
            <div className="flex flex-col gap-2">
              <GlassBar className="h-4 w-full" />
              <GlassBar className="h-4 w-4/5" />
            </div>
          </div>

          {/* Teacher Progress Chart Skeleton */}
          <div className={cn(GLASS_CARD, 'p-6')}>
            <div className="flex items-center justify-between mb-6">
              <GlassBar className="h-6 w-56" />
              <GlassBar className="h-8 w-28 rounded-lg" />
            </div>
            <GlassBar className="h-64 w-full rounded-xl" />
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          {/* Star Leaderboard Skeleton */}
          <div className={cn(GLASS_CARD, 'p-6')}>
            <div className="flex items-center justify-between mb-4">
              <GlassBar className="h-6 w-40" />
              <GlassBar className="h-5 w-16 rounded-full" />
            </div>
            {/* Top 3 Podium Skeleton */}
            <div className="flex items-end justify-center gap-3 my-6">
              <div className="flex flex-col items-center gap-2">
                <GlassBar className="size-12 rounded-full" />
                <GlassBar className="h-20 w-16 rounded-t-lg" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <GlassBar className="size-14 rounded-full" />
                <GlassBar className="h-28 w-16 rounded-t-lg" />
              </div>
              <div className="flex flex-col items-center gap-2">
                <GlassBar className="size-12 rounded-full" />
                <GlassBar className="h-16 w-16 rounded-t-lg" />
              </div>
            </div>
            {/* Ranks List */}
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <div className="flex items-center gap-3">
                    <GlassBar className="size-8 rounded-full" />
                    <GlassBar className="h-4 w-28" />
                  </div>
                  <GlassBar className="h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          </div>

          {/* Activity Heatmap Skeleton */}
          <div className={cn(GLASS_CARD, 'p-6')}>
            <GlassBar className="h-6 w-36 mb-4" />
            <GlassBar className="h-32 w-full rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Complete wireframe skeleton for Tasks Kanban Board (/tasks) */
export function TasksKanbanSkeleton() {
  const columns = ['Rejalashtirilgan', 'Jarayonda', 'Bajarildi'];
  return (
    <div className="flex flex-col gap-6">
      {/* Top action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <GlassBar className="h-8 w-36" />
          <GlassBar className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-3">
          <GlassBar className="h-9 w-32 rounded-xl" />
          <GlassBar className="h-9 w-40 rounded-xl" />
        </div>
      </div>

      {/* Kanban 3-column grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {columns.map((col, idx) => (
          <div key={idx} className={cn(GLASS_CARD, 'flex flex-col gap-4 p-4')}>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <GlassBar className="size-3 rounded-full" />
                <span className="text-sm font-medium text-white/80">{col}</span>
              </div>
              <GlassBar className="h-5 w-8 rounded-full" />
            </div>
            {/* Task Card items in column */}
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 - idx }).map((_, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
                  <GlassBar className="h-5 w-4/5" />
                  <GlassBar className="h-3 w-full" />
                  <div className="flex items-center justify-between pt-2">
                    <GlassBar className="size-6 rounded-full" />
                    <GlassBar className="h-4 w-16 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Complete wireframe skeleton for Finance & Income Roadmap (/finance) */
export function FinanceSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Top summary row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={cn(GLASS_CARD, 'p-5')}>
            <GlassBar className="h-4 w-28 mb-3" />
            <GlassBar className="h-8 w-44 mb-2" />
            <GlassBar className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Income Roadmap Section */}
      <div className={cn(GLASS_CARD, 'p-6')}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <GlassBar className="h-6 w-52 mb-2" />
            <GlassBar className="h-4 w-72" />
          </div>
          <GlassBar className="h-9 w-36 rounded-xl" />
        </div>

        {/* 12-Month Grid Skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 mb-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
              <GlassBar className="h-4 w-12" />
              <GlassBar className="h-5 w-full" />
              <GlassBar className="h-3 w-2/3" />
            </div>
          ))}
        </div>

        {/* Projection Curve Skeleton */}
        <GlassBar className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Complete wireframe skeleton for Staff Directory (/staff) */
export function StaffDirectorySkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Filter and search toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <GlassBar className="h-10 w-72 rounded-xl" />
        <div className="flex items-center gap-2">
          <GlassBar className="h-9 w-24 rounded-lg" />
          <GlassBar className="h-9 w-24 rounded-lg" />
          <GlassBar className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      {/* Staff Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={cn(GLASS_CARD, 'flex flex-col items-center p-6 text-center')}>
            <GlassBar className="size-20 rounded-full mb-4" />
            <GlassBar className="h-5 w-36 mb-2" />
            <GlassBar className="h-4 w-24 mb-4 rounded-full" />
            <div className="w-full flex items-center justify-between pt-4 border-t border-white/10 mt-auto">
              <GlassBar className="h-4 w-20" />
              <GlassBar className="h-4 w-14" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Complete wireframe skeleton for Market (/market) */
export function MarketGridSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Balance Banner */}
      <div className={cn(GLASS_CARD, 'flex items-center justify-between p-6')}>
        <div>
          <GlassBar className="h-6 w-48 mb-2" />
          <GlassBar className="h-4 w-64" />
        </div>
        <GlassBar className="h-10 w-36 rounded-full" />
      </div>

      {/* Product items */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={cn(GLASS_CARD, 'flex flex-col overflow-hidden p-0')}>
            <GlassBar className="h-44 w-full rounded-none" />
            <div className="flex flex-col gap-3 p-5 flex-1">
              <GlassBar className="h-5 w-3/4" />
              <GlassBar className="h-4 w-full" />
              <div className="mt-auto flex items-center justify-between pt-4">
                <GlassBar className="h-6 w-20 rounded-full" />
                <GlassBar className="h-9 w-28 rounded-xl" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Complete wireframe skeleton for Chat (/chat) */
export function ChatSkeleton() {
  return (
    <div className={cn(GLASS_CARD, 'grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-14rem)] overflow-hidden')}>
      {/* Left Chat List (4 cols) */}
      <div className="border-r border-white/10 p-4 lg:col-span-4 flex flex-col gap-3">
        <GlassBar className="h-10 w-full rounded-xl mb-2" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <GlassBar className="size-10 rounded-full shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex justify-between">
                <GlassBar className="h-4 w-28" />
                <GlassBar className="h-3 w-10" />
              </div>
              <GlassBar className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>

      {/* Right Message View (8 cols) */}
      <div className="p-4 lg:col-span-8 flex flex-col justify-between">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <GlassBar className="size-10 rounded-full" />
            <div>
              <GlassBar className="h-4 w-32 mb-1" />
              <GlassBar className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 my-6">
          <div className="flex justify-start">
            <GlassBar className="h-12 w-64 rounded-2xl" />
          </div>
          <div className="flex justify-end">
            <GlassBar className="h-14 w-72 rounded-2xl" />
          </div>
          <div className="flex justify-start">
            <GlassBar className="h-10 w-48 rounded-2xl" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <GlassBar className="h-10 flex-1 rounded-xl" />
          <GlassBar className="h-10 w-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
