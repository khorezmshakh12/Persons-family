'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ChatSidebar } from './chat-sidebar';
import { ConversationView } from './conversation-view';
import type { ChatSender } from './message-bubble';
import type { ActiveConversation, StaffChatMessage, StaffDirectoryEntry } from './types';
import type { ChatMediaType } from '@/lib/chat-media';

function dmKey(a: string, b: string) {
  return [a, b].sort().join('::');
}

export function ChatHubClient({
  currentUserId,
  currentUserName,
  currentUserAvatar,
  isAdmin,
  staff,
  initialFamilyMessages,
  initialChatEnabled,
}: {
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar: string | null;
  isAdmin: boolean;
  staff: StaffDirectoryEntry[];
  initialFamilyMessages: StaffChatMessage[];
  initialChatEnabled: boolean;
}) {
  const [active, setActive] = useState<ActiveConversation>({ type: 'family' });
  const [familyMessages, setFamilyMessages] = useState<StaffChatMessage[]>(initialFamilyMessages);
  const [dmMessagesByPair, setDmMessagesByPair] = useState<Record<string, StaffChatMessage[]>>({});
  const [loadedDmPairs, setLoadedDmPairs] = useState<Set<string>>(new Set());
  const [unreadDmUserIds, setUnreadDmUserIds] = useState<Set<string>>(new Set());
  const [chatEnabled, setChatEnabled] = useState(initialChatEnabled);
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

  const activeRealMessages =
    active.type === 'family' ? familyMessages : (dmMessagesByPair[dmKey(currentUserId, active.userId)] ?? []);

  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    activeRealMessages,
    (state, newMessage: StaffChatMessage) => [...state, newMessage],
  );

  // Load a DM's history the first time it's opened.
  useEffect(() => {
    if (active.type !== 'dm') return;
    const key = dmKey(currentUserId, active.userId);
    if (loadedDmPairs.has(key)) return;

    const otherId = active.userId;
    const supabase = createClient();
    supabase
      .from('staff_chats')
      .select('id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read')
      .or(
        `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${currentUserId})`,
      )
      .order('created_at', { ascending: true })
      .limit(100)
      .then(({ data }) => {
        setDmMessagesByPair((prev) => ({ ...prev, [key]: (data as StaffChatMessage[]) ?? [] }));
        setLoadedDmPairs((prev) => new Set(prev).add(key));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentUserId]);

  // Clear the unread dot for whichever DM is now active.
  useEffect(() => {
    if (active.type !== 'dm') return;
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
    if (active.type !== 'dm') return;
    const otherId = active.userId;
    const key = dmKey(currentUserId, otherId);

    setDmMessagesByPair((prev) => {
      const existing = prev[key];
      if (!existing || !existing.some((m) => m.sender_id === otherId && !m.is_read)) return prev;
      return {
        ...prev,
        [key]: existing.map((m) => (m.sender_id === otherId && !m.is_read ? { ...m, is_read: true } : m)),
      };
    });

    const supabase = createClient();
    supabase.rpc('mark_conversation_read', { other_user_id: otherId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, currentUserId]);

  // Single realtime subscription for the whole table — RLS (which Realtime
  // also enforces) already guarantees a client only ever receives rows it's
  // allowed to see (Family Chat + its own DMs), so it's safe to route
  // whatever arrives into the right bucket client-side rather than trying
  // to express an OR filter server-side.
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_chats' }, (payload) => {
          const message = payload.new as StaffChatMessage;
          if (message.receiver_id === null) {
            setFamilyMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
            return;
          }
          const otherId = message.sender_id === currentUserId ? message.receiver_id : message.sender_id;
          if (message.sender_id !== currentUserId && message.receiver_id !== currentUserId) return;
          const key = dmKey(currentUserId, otherId);
          setDmMessagesByPair((prev) => {
            const existing = prev[key] ?? [];
            if (existing.some((m) => m.id === message.id)) return prev;
            return { ...prev, [key]: [...existing, message] };
          });
          setLoadedDmPairs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
          const current = activeRef.current;
          if (message.sender_id !== currentUserId && (current.type !== 'dm' || current.userId !== otherId)) {
            setUnreadDmUserIds((prev) => new Set(prev).add(otherId));
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'staff_chats' }, (payload) => {
          const updated = payload.new as StaffChatMessage;
          if (updated.receiver_id === null) {
            setFamilyMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          } else {
            const otherId = updated.sender_id === currentUserId ? updated.receiver_id : updated.sender_id;
            const key = dmKey(currentUserId, otherId);
            setDmMessagesByPair((prev) =>
              prev[key] ? { ...prev, [key]: prev[key].map((m) => (m.id === updated.id ? updated : m)) } : prev,
            );
          }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'staff_chats' }, (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setFamilyMessages((prev) => prev.filter((m) => m.id !== deletedId));
          setDmMessagesByPair((prev) => {
            const next: Record<string, StaffChatMessage[]> = {};
            for (const [key, list] of Object.entries(prev)) next[key] = list.filter((m) => m.id !== deletedId);
            return next;
          });
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  function handleOptimisticSend(partial: { messageText?: string; mediaUrl?: string; mediaType?: ChatMediaType }) {
    const optimisticMessage: StaffChatMessage = {
      id: `optimistic-${Date.now()}`,
      sender_id: currentUserId,
      receiver_id: active.type === 'dm' ? active.userId : null,
      message_text: partial.messageText ?? null,
      media_url: partial.mediaUrl ?? null,
      media_type: partial.mediaType ?? 'none',
      pinned_at: null,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    addOptimisticMessage(optimisticMessage);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-white shadow-xl backdrop-blur-lg sm:flex-row">
      <ChatSidebar staff={staff} active={active} onSelect={setActive} unreadDmUserIds={unreadDmUserIds} />
      <ConversationView
        active={active}
        messages={optimisticMessages}
        staffMap={staffMap}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        chatEnabled={chatEnabled}
        onChatEnabledChange={setChatEnabled}
        onOptimisticSend={handleOptimisticSend}
      />
    </div>
  );
}
