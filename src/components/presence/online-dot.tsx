'use client';

import { useOnlineUserIds } from './presence-context';
import { cn } from '@/lib/utils';

export function OnlineDot({ userId, className }: { userId: string; className?: string }) {
  const onlineUserIds = useOnlineUserIds();
  if (!onlineUserIds.has(userId)) return null;

  return (
    <span
      aria-label="Online"
      className={cn(
        'size-2.5 rounded-full bg-emerald-500',
        className,
      )}
    />
  );
}
