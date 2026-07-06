'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useProfile } from './profile-context';

export function UserBadge({ className, nameClassName }: { className?: string; nameClassName?: string }) {
  const { firstName, lastName, avatarUrl } = useProfile();
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Avatar className="border border-white/30">
        <AvatarImage src={avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="bg-white/10 text-white">{initials}</AvatarFallback>
      </Avatar>
      <span className={cn('truncate text-sm text-white/70', nameClassName)}>
        {firstName} {lastName}
      </span>
    </div>
  );
}
