import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <GlassCardSkeleton />
        <GlassCardSkeleton />
        <GlassCardSkeleton />
      </div>
    </div>
  );
}
