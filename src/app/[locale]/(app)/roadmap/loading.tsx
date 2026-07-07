import { GlassGroupGridSkeleton } from '@/components/skeletons/glass-skeletons';

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 sm:p-8">
      <GlassGroupGridSkeleton />
    </div>
  );
}
