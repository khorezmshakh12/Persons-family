'use client';

import { memo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, Clock3, Search, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { OnlineDot } from '@/components/presence/online-dot';
import { respondToDmRequestAction } from '@/lib/actions/staff-chats';
import { ImportantChatsPanel } from './important-chats-panel';
import { cn } from '@/lib/utils';
import { roleLabel } from '@/lib/roles';
import type { ActiveConversation, ConversationState, StaffDirectoryEntry } from './types';

// Memoized so switching the active conversation only re-renders the two
// rows whose isActive actually flipped, not every row in the list.
const ChatSidebarItem = memo(function ChatSidebarItem({
  person,
  state,
  isActive,
  isUnread,
  onSelect,
  index,
  statusTag,
}: {
  person: StaffDirectoryEntry;
  state: ConversationState;
  isActive: boolean;
  isUnread: boolean;
  onSelect: (userId: string) => void;
  index: number;
  statusTag?: React.ReactNode;
}) {
  const t = useTranslations('chatHub');
  const tStaff = useTranslations('staff');
  const initials = `${person.first_name[0]}${person.last_name[0]}`;
  return (
    <button
      type="button"
      onClick={() => onSelect(person.id)}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
      data-active={isActive}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'ch-item tap-scale animate-fade-in-up flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors',
        isActive ? 'text-au-ink' : 'text-au-muted hover:bg-au-card-2',
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="ch-avatar size-11">
          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <OnlineDot
          userId={person.id}
          className="absolute right-0 bottom-0 size-3 border-2 border-au-card"
        />
      </div>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn('truncate font-semibold', isActive || isUnread ? 'text-au-ink' : 'text-au-ink/90')}>
          {person.first_name} {person.last_name} {statusTag}
        </span>
        <span className="truncate text-xs text-au-faint">{roleLabel(tStaff, person.role)}</span>
      </span>
      {state.kind === 'pendingOutgoing' && (
        <Clock3
          className="size-3.5 shrink-0 text-au-muted"
          aria-label={t('requests.pendingOutgoing')}
        />
      )}
      {isUnread && !isActive && (
        <span className="ch-unread size-2.5 shrink-0 rounded-full" aria-label={t('newMessage')} />
      )}
    </button>
  );
});

function IncomingRequestCard({
  person,
  conversationId,
  onResolved,
}: {
  person: StaffDirectoryEntry;
  conversationId: string;
  onResolved: () => void;
}) {
  const t = useTranslations('chatHub');
  const [isPending, startTransition] = useTransition();
  const initials = `${person.first_name[0]}${person.last_name[0]}`;

  function respond(decision: 'accept' | 'decline') {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('conversationId', conversationId);
      formData.set('decision', decision);
      const result = await respondToDmRequestAction(undefined, formData);
      if (result?.error) toast.error(t(`errors.${result.error}`));
      else onResolved();
    });
  }

  return (
    <div className="animate-pop-in flex flex-col gap-2 rounded-xl border border-au-line bg-au-card p-3">
      <div className="flex items-center gap-2">
        <Avatar className="size-7 shrink-0">
          <AvatarImage src={person.avatar_url ?? undefined} alt="" />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-xs text-au-ink">
          {t('requests.wantsToChat', { name: `${person.first_name} ${person.last_name}` })}
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          onClick={() => respond('accept')}
          className="h-7 flex-1 gap-1 bg-emerald-600 px-2 text-xs hover:bg-emerald-700"
        >
          <Check className="size-3.5" />
          {t('requests.accept')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => respond('decline')}
          className="h-7 flex-1 gap-1 border-red-400/30 bg-red-500/10 px-2 text-xs text-red-700 hover:bg-red-500/20"
        >
          <X className="size-3.5" />
          {t('requests.decline')}
        </Button>
      </div>
    </div>
  );
}

export function ChatSidebar({
  staff,
  conversationStates,
  active,
  onSelect,
  onRequestResolved,
  unreadDmUserIds,
  canModerateDmImportance,
  header,
  renderChannels,
  statusTagFor,
}: {
  /** Above everything: the viewer's status + global search. */
  header?: React.ReactNode;
  /** Channels block under the search box (gets the same filter text). */
  renderChannels?: (needle: string) => React.ReactNode;
  statusTagFor?: (userId: string) => React.ReactNode;
  staff: StaffDirectoryEntry[];
  conversationStates: Record<string, ConversationState>;
  active: ActiveConversation;
  onSelect: (userId: string) => void;
  /** Refresh the server-fetched conversation states after an accept/decline. */
  onRequestResolved: () => void;
  /** Staff ids with a DM message that arrived while a different conversation
   * was open — shown as a small dot until that DM is opened. */
  unreadDmUserIds: Set<string>;
  /** CEO/IT Developer only — see ImportantChatsPanel. */
  canModerateDmImportance: boolean;
}) {
  const t = useTranslations('chatHub');

  const incomingRequests = staff.filter(
    (s) => conversationStates[s.id]?.kind === 'pendingIncoming',
  );
  // Incoming requests get their own card above — no need to also list them
  // in the plain contact list below.
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const visibleContacts = staff
    .filter((s) => conversationStates[s.id]?.kind !== 'pendingIncoming')
    .filter((s) => !needle || `${s.first_name} ${s.last_name}`.toLowerCase().includes(needle))
    // Unread conversations float to the top, like Telegram.
    .sort((a, b) => Number(unreadDmUserIds.has(b.id)) - Number(unreadDmUserIds.has(a.id)));

  return (
    <nav className="ch-side flex h-full w-full flex-col gap-1 overflow-y-auto p-3 sm:w-72 sm:shrink-0 sm:border-r sm:border-au-line">
      {header}
      {canModerateDmImportance && (
        <div className="mb-2">
          <ImportantChatsPanel />
        </div>
      )}

      {incomingRequests.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          <p className="px-3 text-[11px] font-semibold tracking-wide text-au-muted uppercase">
            {t('requests.title')}
          </p>
          {incomingRequests.map((person) => (
            <IncomingRequestCard
              key={person.id}
              person={person}
              conversationId={
                (conversationStates[person.id] as { conversationId: string }).conversationId
              }
              onResolved={onRequestResolved}
            />
          ))}
        </div>
      )}

      <label className="ch-search sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-full border border-au-line bg-au-card-2 px-3 py-2">
        <Search className="size-4 shrink-0 text-au-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('search')}
          className="min-w-0 flex-1 bg-transparent text-sm text-au-ink outline-none placeholder:text-au-faint"
        />
      </label>
      {renderChannels?.(needle)}
      <p className="px-3 text-[11px] font-semibold tracking-wide text-au-muted uppercase">
        {t('individualChats')}
      </p>

      {visibleContacts.length === 0 ? (
        <p className="px-3 py-2 text-sm text-au-muted">{t('noStaff')}</p>
      ) : (
        visibleContacts.map((person, index) => (
          <ChatSidebarItem
            key={person.id}
            person={person}
            state={conversationStates[person.id] ?? { kind: 'none' }}
            isActive={active?.userId === person.id}
            isUnread={unreadDmUserIds.has(person.id)}
            onSelect={onSelect}
            index={index}
            statusTag={statusTagFor?.(person.id)}
          />
        ))
      )}
    </nav>
  );
}
