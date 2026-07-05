import { GlassTableSkeleton } from '@/components/skeletons/glass-skeletons';

export function TablePageSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="h-8 w-40 animate-pulse rounded-md bg-white/15" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-white/15" />
      </div>
      <GlassTableSkeleton rows={5} />
    </div>
  );
}
