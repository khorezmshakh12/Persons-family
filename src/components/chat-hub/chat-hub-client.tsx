'use client';

import { useEffect, useMemo, useOptimistic, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { getDmHistoryAction } from '@/lib/actions/staff-chats';
import { markConversationReadAction } from '@/lib/actions/notifications';
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

// Matches lib/gcp/firestoreAdmin.ts's conversationId() — the Firestore doc
// id for a DM pair, distinct from dmKey() above (which is only this
// component's own local state key, using "::" instead of "_").
function firestoreConversationId(a: string, b: string) {
  return [a, b].sort().join('_');
}

type FirestoreChatMessage = {
  senderId: string;
  receiverId: string;
  messageText: string | null;
  mediaUrl: string | null;
  mediaType: ChatMediaType;
  createdAt: string;
};

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
    if (!withUserId) {
      // No deep link in the URL (either there never was one, or the block
      // below just consumed it) — re-arm so the *next* `?with=` navigation
      // is applied even if it names the same contact as the last one.
      appliedDeepLinkRef.current = null;
      return;
    }
    if (appliedDeepLinkRef.current === withUserId) return;
    appliedDeepLinkRef.current = withUserId;
    setActive({ userId: withUserId });

    // Consume the deep link. Leaving `?with=X` in the URL meant a later
    // bell click on X pointed at the URL we were already on: the canonical
    // URL doesn't change, so `searchParams` never changes, this effect
    // never re-runs and nothing opens — the "the notification doesn't
    // open" half of the report, hit whenever you'd since switched to a
    // different contact in the sidebar.
    //
    // `history.replaceState`, not `router.replace`: Next syncs
    // `useSearchParams` from the native History API *without* an RSC round
    // trip (next docs, "Native History API"). It re-runs this effect
    // exactly once more, on the now-`with`-less URL, where the early
    // return above stops it — it cannot re-arm itself.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('with');
    const rest = params.toString();
    window.history.replaceState(
      null,
      '',
      rest ? `${window.location.pathname}?${rest}` : window.location.pathname,
    );
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
    getDmHistoryAction(otherId)
      .then((data) => {
        setDmMessagesByPair((prev) => ({
          ...prev,
          [key]: data as unknown as StaffChatMessage[],
        }));
        setLoadedDmPairs((prev) => new Set(prev).add(key));
      })
      .catch((error) => {
        // Deliberately does NOT mark this pair as loaded on failure — the
        // effect below re-runs the next time this DM is opened instead of
        // permanently caching an empty conversation.
        console.error('Failed to load DM history', error);
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

  // Id of the newest message the *other* side sent in the currently-open
  // DM, as far as this client knows — `null` until that pair's history has
  // loaded (or if they've never sent anything). This is only ever used as a
  // *signature* for the read-receipt effect below: it changes when a
  // genuinely newer inbound message lands and at no other time. A
  // re-render, a `router.refresh()`, a new `conversationStates` object, or
  // the optimistic is_read flip all leave it byte-identical, which is what
  // keeps that effect from re-arming.
  const latestInboundMessageId = useMemo(() => {
    if (!active) return null;
    const messages = dmMessagesByPair[dmKey(currentUserId, active.userId)];
    if (!messages) return null;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender_id === active.userId) return messages[i].id;
    }
    return null;
  }, [active, currentUserId, dmMessagesByPair]);

  // Read receipts: opening a DM marks every message the other person sent
  // us as read. The Server Action is the source of truth (scoped
  // server-side to rows where we're genuinely the receiver); the local
  // state update just flips the tick to blue immediately instead of
  // waiting on a realtime echo (Firestore's mirrored message docs don't
  // carry is_read at all — see the messages-listener effect below — so
  // there is no echo to wait on anymore; this optimistic flip is now the
  // only thing that ever sets it locally).
  //
  // THE BUG: this used to bail out (`if (flippedIds.length === 0) return`)
  // before ever calling the Server Action, i.e. it only marked a
  // conversation read when this client *already had* unread rows for it in
  // `dmMessagesByPair`. On a first open that map is empty — the history
  // fetch is a separate, still-in-flight effect — so opening a chat did
  // nothing at all server-side, and the sidebar dot, the nav "chat" badge
  // and the bell's unreadChats (all three derived from
  // `staff_chats.is_read`) stayed lit. It only ever appeared to work on the
  // *second* open of the same conversation, once the history had landed.
  //
  // The call is now driven by "which conversation is open, and what's the
  // newest thing they've said in it" instead — which also covers a message
  // arriving while the thread is already open. Three independent things
  // stop it re-arming: the signature can't change on a re-render, the ref
  // admits one call per signature, and a redundant call returns `false`
  // from the action (0 rows flipped) so no `router.refresh()` follows.
  const markedReadSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!active || activeConversationState.kind !== 'accepted') return;
    const otherId = active.userId;
    const key = dmKey(currentUserId, otherId);

    const signature = `${key}|${latestInboundMessageId ?? ''}`;
    if (markedReadSignatureRef.current === signature) return;
    markedReadSignatureRef.current = signature;

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

    markConversationReadAction(otherId)
      .then((marked) => {
        // `marked` is "did this actually flip a row" (see
        // lib/db/queries/mark-seen.ts) — the boolean exists precisely so a
        // no-op mark-read can't trigger a full RSC refetch. Only a real
        // flip refreshes: the sidebar NAV's "chat" dot (NavBadgesProvider)
        // is otherwise only realtime-driven, which has proven unreliable in
        // practice — see the identical comment in notification-bell.tsx's
        // handleChatClick.
        if (marked) router.refresh();
      })
      .catch((error) => {
        console.error('mark_conversation_read failed', error);
        // Let a later re-open retry instead of caching the failure for the
        // lifetime of the page. Clearing the ref doesn't re-run this effect
        // by itself (refs aren't reactive), so this can't spin.
        markedReadSignatureRef.current = null;
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
      });
    // `router` is deliberately NOT a dep — useRouter() from
    // @/i18n/navigation returns a new object every render, and this effect
    // calls a Server Action + router.refresh() (see AGENTS.md).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, activeConversationState.kind, currentUserId, latestInboundMessageId]);

  // Live message delivery for whichever DM is currently open — subscribes
  // to that pair's Firestore messages subcollection (see
  // lib/gcp/firestoreAdmin.ts's mirrorChatMessage(), which every confirmed
  // send writes into). Only the active pair, not every known contact — see
  // the sidebar-unread effect below for how *other* pairs are noticed.
  useEffect(() => {
    if (!active) return;
    const otherId = active.userId;
    const key = dmKey(currentUserId, otherId);
    const conversationId = firestoreConversationId(currentUserId, otherId);
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const messagesQuery = query(
          collection(getRealtimeDb(), 'chats', conversationId, 'messages'),
          orderBy('createdAt', 'asc'),
        );
        unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
          setDmMessagesByPair((prev) => {
            const existing = prev[key] ?? [];
            const byId = new Map(existing.map((m) => [m.id, m]));
            for (const change of snapshot.docChanges()) {
              if (change.type === 'removed') {
                byId.delete(change.doc.id);
                continue;
              }
              const data = change.doc.data() as FirestoreChatMessage;
              const previousLocal = byId.get(change.doc.id);
              byId.set(change.doc.id, {
                // Firestore is trusted for message content (see brief), but
                // is_read has no home there — preserve whatever local
                // read-state this id already had (set only by the
                // read-receipt effect above) rather than resetting it.
                id: change.doc.id,
                sender_id: data.senderId,
                receiver_id: data.receiverId,
                message_text: data.messageText,
                media_url: data.mediaUrl,
                media_type: data.mediaType,
                created_at: data.createdAt,
                is_read: previousLocal?.is_read ?? false,
                pinned_at: previousLocal?.pinned_at ?? null,
                reply_to_id: previousLocal?.reply_to_id ?? null,
                reactions: previousLocal?.reactions ?? {},
              });
            }
            const next = Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
            return { ...prev, [key]: next };
          });
          setLoadedDmPairs((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
        });
      })
      .catch((error) => console.error('chat hub realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active, currentUserId]);

  // Sidebar unread dots for pairs that aren't the currently-open one: one
  // lightweight doc listener per known contact (bounded by the staff
  // roster size) on chats/{pairId}'s updatedAt, which mirrorChatMessage()
  // bumps on every send. The first snapshot per contact is treated as a
  // baseline, not a new-message event — initialUnreadSenderIds already
  // seeded whatever was unread as of the server render.
  useEffect(() => {
    let cancelled = false;
    const unsubscribes: (() => void)[] = [];
    const seenBaseline = new Map<string, number>();

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const db = getRealtimeDb();
        for (const contact of staff) {
          const conversationId = firestoreConversationId(currentUserId, contact.id);
          const unsubscribe = onSnapshot(doc(db, 'chats', conversationId), (snapshot) => {
            const updatedAtMs = snapshot.get('updatedAt')?.toMillis?.() ?? null;
            if (updatedAtMs === null) return;
            const baseline = seenBaseline.get(contact.id);
            if (baseline === undefined) {
              seenBaseline.set(contact.id, updatedAtMs);
              return;
            }
            if (updatedAtMs === baseline) return;
            seenBaseline.set(contact.id, updatedAtMs);
            if (activeRef.current?.userId === contact.id) return; // active pair has its own listener
            setUnreadDmUserIds((prev) => (prev.has(contact.id) ? prev : new Set(prev).add(contact.id)));
          });
          unsubscribes.push(unsubscribe);
        }
      })
      .catch((error) => console.error('chat hub sidebar realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribes.forEach((unsub) => unsub());
    };
  }, [staff, currentUserId]);

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
  // — the sender doesn't wait on the Firestore echo (which is what let the
  // optimistic bubble disappear for a beat once its transition settled,
  // before that echo arrived to replace it). The messages-listener effect
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
      {/* Below `sm:`, the sidebar and the active thread would otherwise
          share the viewport's height and squeeze each other unusable — show
          exactly one at a time (list, or the open thread with a back
          button) and let `sm:flex` restore the side-by-side desktop layout. */}
      <div className={cn('min-h-0', active ? 'hidden sm:flex sm:h-full' : 'flex h-full')}>
        <ChatSidebar
          staff={staff}
          conversationStates={conversationStates}
          active={active}
          onSelect={(userId) => setActive({ userId })}
          onRequestResolved={() => router.refresh()}
          unreadDmUserIds={unreadDmUserIds}
          canModerateDmImportance={canModerateDmImportance}
        />
      </div>
      <div className={cn('min-h-0 flex-1', active ? 'flex h-full' : 'hidden sm:flex sm:h-full')}>
        <ConversationView
          active={active}
          conversationState={activeConversationState}
          messages={optimisticMessages}
          staffMap={staffMap}
          currentUserId={currentUserId}
          onSendRequest={() => router.refresh()}
          onOptimisticSend={handleOptimisticSend}
          onConfirmedSend={handleConfirmedSend}
          onBack={() => setActive(null)}
        />
      </div>
    </div>
  );
}
