'use client';

import { memo } from 'react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OnlineDot } from '@/components/presence/online-dot';
import { ImportantChatsPanel } from './important-chats-panel';
import { cn } from '@/lib/utils';
import type { ActiveConversation, StaffDirectoryEntry } from './types';

// Memoized so switching the active conversation only re-renders the two
// rows whose isActive actually flipped, not every row in the list.
const ChatSidebarItem = memo(function ChatSidebarItem({
  person,
  isActive,
  isUnread,
  onSelect,
}: {
  person: StaffDirectoryEntry;
  isActive: boolean;
  isUnread: boolean;
  onSelect: (conversation: ActiveConversation) => void;
}) {
  const initials = `${person.first_name[0]}${person.last_name[0]}`;
  return (
    <button
      type="button"
      onClick={() => onSelect({ type: 'dm', userId: person.id })}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors',
        isActive ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10',
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="size-8">
          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <OnlineDot
          userId={person.id}
          className="absolute right-0 bottom-0 size-2 border border-slate-900"
        />
      </div>
      <span className="min-w-0 flex-1 truncate">
        {person.first_name} {person.last_name}
      </span>
      {isUnread && !isActive && (
        <span className="size-2 shrink-0 rounded-full bg-teal-400" aria-hidden />
      )}
    </button>
  );
});

export function ChatSidebar({
  staff,
  active,
  onSelect,
  unreadDmUserIds,
  canModerateDmImportance,
}: {
  staff: StaffDirectoryEntry[];
  active: ActiveConversation;
  onSelect: (conversation: ActiveConversation) => void;
  /** Staff ids with a DM message that arrived while a different conversation
   * was open — shown as a small dot until that DM is opened. */
  unreadDmUserIds: Set<string>;
  /** CEO/IT Developer only — see ImportantChatsPanel. */
  canModerateDmImportance: boolean;
}) {
  const t = useTranslations('chatHub');

  return (
    <nav className="flex h-full w-full flex-col gap-1 overflow-y-auto p-3 sm:w-72 sm:shrink-0 sm:border-r sm:border-white/15">
      {canModerateDmImportance && (
        <div className="mb-2">
          <ImportantChatsPanel />
        </div>
      )}
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
        staff.map((person) => (
          <ChatSidebarItem
            key={person.id}
            person={person}
            isActive={active.type === 'dm' && active.userId === person.id}
            isUnread={unreadDmUserIds.has(person.id)}
            onSelect={onSelect}
          />
        ))
      )}
    </nav>
  );
}
