'use client';

import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { ActiveConversation, StaffDirectoryEntry } from './types';

export function ChatSidebar({
  staff,
  active,
  onSelect,
  unreadDmUserIds,
}: {
  staff: StaffDirectoryEntry[];
  active: ActiveConversation;
  onSelect: (conversation: ActiveConversation) => void;
  /** Staff ids with a DM message that arrived while a different conversation
   * was open — shown as a small dot until that DM is opened. */
  unreadDmUserIds: Set<string>;
}) {
  const t = useTranslations('chatHub');

  return (
    <nav className="flex h-full w-full flex-col gap-1 overflow-y-auto p-3 sm:w-72 sm:shrink-0 sm:border-r sm:border-white/15">
      <button
        type="button"
        onClick={() => onSelect({ type: 'family' })}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
          active.type === 'family' ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10',
        )}
      >
        <span className="text-lg">👨‍👩‍👧‍👦</span>
        {t('familyChat')}
      </button>

      <p className="mt-3 px-3 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
        {t('individualChats')}
      </p>

      {staff.length === 0 ? (
        <p className="px-3 py-2 text-sm text-white/50">{t('noStaff')}</p>
      ) : (
        staff.map((person) => {
          const isActive = active.type === 'dm' && active.userId === person.id;
          const initials = `${person.first_name[0]}${person.last_name[0]}`;
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => onSelect({ type: 'dm', userId: person.id })}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                isActive ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10',
              )}
            >
              <Avatar className="size-8 shrink-0">
                <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">
                {person.first_name} {person.last_name}
              </span>
              {unreadDmUserIds.has(person.id) && !isActive && (
                <span className="size-2 shrink-0 rounded-full bg-teal-400" aria-hidden />
              )}
            </button>
          );
        })
      )}
    </nav>
  );
}
