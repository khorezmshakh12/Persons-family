'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineDot } from '@/components/presence/online-dot';
import { cn } from '@/lib/utils';
import { useProfile } from './profile-context';

export function UserBadge({
  className,
  nameClassName,
  userId,
}: {
  className?: string;
  nameClassName?: string;
  /** Shows the presence dot when provided — omitted call sites (e.g. before
   * the current user's own id is known) simply render without one. */
  userId?: string;
}) {
  const { firstName, lastName, avatarUrl } = useProfile();
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <div className="relative shrink-0">
        <Avatar className="border border-white/30">
          <AvatarImage src={avatarUrl ?? undefined} alt="" />
          <AvatarFallback className="bg-white/10 text-white">{initials}</AvatarFallback>
        </Avatar>
        {userId && <OnlineDot userId={userId} className="absolute right-0 bottom-0 border-2 border-slate-900" />}
      </div>
      <span className={cn('truncate text-sm text-white/70', nameClassName)}>
        {firstName} {lastName}
      </span>
    </div>
  );
}
