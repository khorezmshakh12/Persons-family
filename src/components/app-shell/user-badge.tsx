'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineDot } from '@/components/presence/online-dot';
import { avatarGradientClass, initialsOf } from '@/lib/avatar-palette';
import { cn } from '@/lib/utils';
import { useProfile } from './profile-context';

export function UserBadge({
  className,
  nameClassName,
  subtitle,
  userId,
}: {
  className?: string;
  nameClassName?: string;
  /** Optional second line under the name (e.g. the role label). */
  subtitle?: string;
  /** Shows the presence dot when provided — omitted call sites (e.g. before
   * the current user's own id is known) simply render without one. */
  userId?: string;
}) {
  const { firstName, lastName, avatarUrl } = useProfile();

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <div className="relative shrink-0">
        <Avatar>
          <AvatarImage src={avatarUrl ?? undefined} alt="" />
          <AvatarFallback className={cn('text-xs font-bold text-white', avatarGradientClass(userId))}>
            {initialsOf(firstName, lastName)}
          </AvatarFallback>
        </Avatar>
        {userId && <OnlineDot userId={userId} className="absolute right-0 bottom-0 border-2 border-au-sidebar" />}
      </div>
      <span className="flex min-w-0 flex-col">
        <span className={cn('truncate text-sm leading-4 text-au-ink', nameClassName)}>
          {firstName} {lastName}
        </span>
        {subtitle && <span className="truncate text-xs text-au-muted">{subtitle}</span>}
      </span>
    </div>
  );
}
