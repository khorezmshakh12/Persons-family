import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-4xl flex-col gap-4 p-4">
      <Skeleton className="h-16 w-2/3 self-start rounded-2xl" />
      <Skeleton className="h-16 w-2/3 self-end rounded-2xl" />
      <Skeleton className="h-16 w-1/2 self-start rounded-2xl" />
    </div>
  );
}
