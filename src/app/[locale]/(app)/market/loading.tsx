import { GlassCardSkeleton } from '@/components/skeletons/glass-skeletons';

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <GlassCardSkeleton />
      <GlassCardSkeleton />
      <GlassCardSkeleton />
    </div>
  );
}
