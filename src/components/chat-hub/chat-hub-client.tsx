'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { ChatSidebar } from './chat-sidebar';
import { ConversationView } from './conversation-view';
import type { ChatSender } from './message-bubble';
import type {
  ActiveConversation,
  ConversationState,
  StaffChatMessage,
  StaffDirectoryEntry,
} from './types';
import type { ChatMediaType } from '@/lib/chat-media';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

function dmKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

export function ChatHubClient({
  currentUserId,
  currentUserName,
  currentUserAvatar,
  canModerateDmImportance,
  staff,
  conversationStates,
  initialUnreadSenderIds,
}: {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string | null;
  canModerateDmImportance: boolean;
  staff: StaffDirectoryEntry[];
  /** Server-computed per-contact request/accept state — the source of
   * truth for whether a composer, a "send request" prompt, or a "waiting
   * for approval" state renders. Refreshed via router.refresh() after any
   * action that can change it (send request, accept, decline). */
  conversationStates: Record<string, ConversationState>;
  initialUnreadSenderIds: string[];
}) {
  const t = useTranslations('notifications');
  const router = useRouter();
  const searchParams = useSearchParams();
  const [active, setActive] = useState<ActiveConversation>(null);

  // Deep-linked from the notification bell (`/chat?with=<userId>`) — open
  // that conversation directly instead of landing on the bare "select a
  // contact" state and making the user click a second time. Only runs once
  // per distinct `with` value, since selecting a different contact
  // afterward shouldn't keep snapping back to this one.
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const withUserId = searchParams.get('with');
    if (!withUserId || appliedDeepLinkRef.current === withUserId) return;
    appliedDeepLinkRef.current = withUserId;
    setActive({ userId: withUserId });
  }, [searchParams]);
  const [dmMessagesByPair, setDmMessagesByPair] = useState<Record<string, StaffChatMessage[]>>({});
  const [loadedDmPairs, setLoadedDmPairs] = useState<Set<string>>(new Set());
  const [unreadDmUserIds, setUnreadDmUserIds] = useState<Set<string>>(
    () => new Set(initialUnreadSenderIds),
  );
  const activeRef = useRef(active);
  activeRef.current = active;

  const [firstName, ...lastNameParts] = currentUserName.split(' ');
  const staffMap: Record<string, ChatSender> = useMemo(() => {
    const map: Record<string, ChatSender> = {
      [currentUserId]: {
        first_name: firstName,
        last_name: lastNameParts.join(' '),
        avatar_url: currentUserAvatar,
      },
    };
    for (const s of staff) {
      map[s.id] = { first_name: s.first_name, last_name: s.last_name, avatar_url: s.avatar_url };
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, currentUserId, currentUserName, currentUserAvatar]);

  const activeConversationState: ConversationState = active
    ? (conversationStates[active.userId] ?? { kind: 'none' })
    : { kind: 'none' };

  const activeRealMessages = active
    ? (dmMessagesByPair[dmKey(currentUserId, active.userId)] ?? [])
    : [];

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    activeRealMessages,
    (state, newMessage: StaffChatMessage) => [...state, newMessage],
  );

  // Load a DM's history the first time it's opened (only once it's actually
  // accepted — a pending/none conversation has no composer and, for a
  // pending-outgoing one, no messages exist yet to load anyway).
  useEffect(() => {
    if (!active || activeConversationState.kind !== 'accepted') return;
    const key = dmKey(currentUserId, active.userId);
    if (loadedDmPairs.has(key)) return;

    const otherId = active.userId;
    const supabase = createClient();
    supabase
      .from('staff_chats')
      .select(
        'id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read, reply_to_id, reactions',
      )
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUserId})`,
      )
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          // Deliberately does NOT mark this pair as loaded on failure — the
          // effect below re-runs the next time this DM is opened instead of
          // permanently caching an empty conversation.
          console.error('Failed to load DM history', error);
          return;
        }
        setDmMessagesByPair((prev) => ({
          ...prev,
          [key]: (data as unknown as StaffChatMessage[]) ?? [],
        }));
        setLoadedDmPairs((prev) => new Set(prev).add(key));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeConversationState.kind, currentUserId]);

  // Clear the unread dot for whichever DM is now active.
  useEffect(() => {
    if (!active) return;
    setUnreadDmUserIds((prev) => {
      if (!prev.has(active.userId)) return prev;
      const next = new Set(prev);
      next.delete(active.userId);
      return next;
    });
  }, [active]);

  // Read receipts: opening a DM marks every message the other person sent
  // us as read. The RPC is the source of truth (security-definer, scoped to
  // rows where we're genuinely the receiver); the local state update just
  // flips the tick to blue immediately instead of waiting on the realtime
  // UPDATE echo to round-trip back.
  useEffect(() => {
    if (!active || activeConversationState.kind !== 'accepted') return;
    const otherId = active.userId;
    const key = dmKey(currentUserId, otherId);

    let flippedIds: string[] = [];
    setDmMessagesByPair((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      const toFlip = existing.filter((m) => m.sender_id === otherId && !m.is_read);
      if (toFlip.length === 0) return prev;
      flippedIds = toFlip.map((m) => m.id);
      return {
        ...prev,
        [key]: existing.map((m) =>
          m.sender_id === otherId && !m.is_read ? { ...m, is_read: true } : m,
        ),
      };
    });

    if (flippedIds.length === 0) return;

    const supabase = createClient();
    supabase.rpc('mark_conversation_read', { other_user_id: otherId }).then(({ error }) => {
      if (error) {
        console.error('mark_conversation_read failed', error);
        // Revert exactly the messages this effect optimistically flipped —
        // the DB still has them unread, so the tick/sidebar dot should too.
        setDmMessagesByPair((prev) => {
          const existing = prev[key];
          if (!existing) return prev;
          return {
            ...prev,
            [key]: existing.map((m) => (flippedIds.includes(m.id) ? { ...m, is_read: false } : m)),
          };
        });
        toast.error(t('markReadFailed'));
        return;
      }
      // The sidebar NAV's "chat" dot (NavBadgesProvider) is otherwise only
      // realtime-driven, which has proven unreliable in practice — see the
      // identical comment in notification-bell.tsx's handleChatClick.
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeConversationState.kind, currentUserId]);

  // Single realtime subscription for the whole table — RLS (which Realtime
  // also enforces) already guarantees a client only ever receives rows it's
  // allowed to see (its own DMs), so it's safe to route whatever arrives
  // into the right bucket client-side rather than trying to express an OR
  // filter server-side.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('staff_chats_hub')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'staff_chats' },
          (payload) => {
            const message = payload.new as StaffChatMessage;
            const otherId =
              message.sender_id === currentUserId ? message.receiver_id : message.sender_id;
            if (message.sender_id !== currentUserId && message.receiver_id !== currentUserId)
              return;
            const key = dmKey(currentUserId, otherId);
            setDmMessagesByPair((prev) => {
              const existing = prev[key] ?? [];
              if (existing.some((m) => m.id === message.id)) return prev;
              return { ...prev, [key]: [...existing, message] };
            });
            setLoadedDmPairs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
            const current = activeRef.current;
            if (message.sender_id !== currentUserId && current?.userId !== otherId) {
              setUnreadDmUserIds((prev) => new Set(prev).add(otherId));
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'staff_chats' },
          (payload) => {
            const updated = payload.new as StaffChatMessage;
            const otherId =
              updated.sender_id === currentUserId ? updated.receiver_id : updated.sender_id;
            const key = dmKey(currentUserId, otherId);
            setDmMessagesByPair((prev) =>
              prev[key]
                ? { ...prev, [key]: prev[key].map((m) => (m.id === updated.id ? updated : m)) }
                : prev,
            );
            // A message from this sender was marked read somewhere else —
            // the notification bell, another tab, opening this DM just now
            // — so the sidebar dot should clear regardless of which path
            // did it, not only the "this DM just became active" effect.
            if (updated.is_read && updated.receiver_id === currentUserId) {
              setUnreadDmUserIds((prev) => {
                if (!prev.has(updated.sender_id)) return prev;
                const next = new Set(prev);
                next.delete(updated.sender_id);
                return next;
              });
            }
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'staff_chats' },
          (payload) => {
            const deletedId = (payload.old as { id: string }).id;
            setDmMessagesByPair((prev) => {
              const next: Record<string, StaffChatMessage[]> = {};
              for (const [key, list] of Object.entries(prev))
                next[key] = list.filter((m) => m.id !== deletedId);
              return next;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  function handleOptimisticSend(partial: {
    messageText?: string;
    mediaUrl?: string;
    mediaType?: ChatMediaType;
    replyToId?: string;
  }) {
    if (!active) return;
    const optimisticMessage: StaffChatMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: currentUserId,
      receiver_id: active.userId,
      message_text: partial.messageText ?? null,
      media_url: partial.mediaUrl ?? null,
      media_type: partial.mediaType ?? 'none',
      pinned_at: null,
      created_at: new Date().toISOString(),
      is_read: false,
      reply_to_id: partial.replyToId ?? null,
      reactions: {},
    };
    addOptimisticMessage(optimisticMessage);
  }

  // Commits the send action's own confirmed row into real state right away
  // — the sender doesn't wait on the Realtime INSERT echo (which is what
  // let the optimistic bubble disappear for a beat once its transition
  // settled, before that echo arrived to replace it). The realtime handler
  // above already de-dupes by id, so when the echo does eventually land it
  // just no-ops instead of double-adding this message.
  function handleConfirmedSend(message: StaffChatMessage) {
    const otherId = message.sender_id === currentUserId ? message.receiver_id : message.sender_id;
    const key = dmKey(currentUserId, otherId);
    setDmMessagesByPair((prev) => {
      const existing = prev[key] ?? [];
      if (existing.some((m) => m.id === message.id)) return prev;
      return { ...prev, [key]: [...existing, message] };
    });
  }

  return (
    <div className={cn(GLASS_CARD, 'flex h-full min-h-0 flex-col overflow-hidden sm:flex-row')}>
      <ChatSidebar
        staff={staff}
        conversationStates={conversationStates}
        active={active}
        onSelect={(userId) => setActive({ userId })}
        onRequestResolved={() => router.refresh()}
        unreadDmUserIds={unreadDmUserIds}
        canModerateDmImportance={canModerateDmImportance}
      />
      <ConversationView
        active={active}
        conversationState={activeConversationState}
        messages={optimisticMessages}
        staffMap={staffMap}
        currentUserId={currentUserId}
        onSendRequest={() => router.refresh()}
        onOptimisticSend={handleOptimisticSend}
        onConfirmedSend={handleConfirmedSend}
      />
    </div>
  );
}
