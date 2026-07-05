import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded-md bg-white/15" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-white/15" />
      </div>
      <GlassGroupGridSkeleton />
    </div>
  );
}
