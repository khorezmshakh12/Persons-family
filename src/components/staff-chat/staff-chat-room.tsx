'use client';

import { useEffect, useOptimistic, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { StaffMessageItem, type ChatSender } from './staff-message-item';
import { StaffMessageComposer } from './staff-message-composer';

type Message = { id: string; user_id: string; content: string; created_at: string };

type FirestoreGroupChatMessage = { senderId: string; content: string; createdAt: string };

export function StaffChatRoom({
  conversationId,
  initialMessages,
  staffMap,
  currentUserId,
  canPost = true,
  compact = false,
}: {
  conversationId: string;
  initialMessages: Message[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
  /** False for CEO/Admin "monitor" access to a group's staff chat — they
   * can read but the Server Action would reject an insert, so hide the
   * composer rather than let them hit a silent failure. */
  canPost?: boolean;
  /** Snippet mode for embedding inside a group page — shows only the last
   * few messages and skips auto-scroll, instead of rendering as a
   * full-height room. */
  compact?: boolean;
}) {
  const t = useTranslations('staffChat');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage],
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // Live delivery via group_chats/{conversationId}/messages — mirrored by
  // sendStaffChatMessageAction (lib/actions/staff-chat.ts) right after each
  // Cloud SQL insert. See lib/gcp/firestoreAdmin.ts's
  // mirrorGroupChatMessage() and firestore.rules' group_chat_meta-gated
  // read rule (membership = the group's teacher + assigned TA, kept in
  // sync by groups.ts).
  //
  // Note: message deletion (deleteStaffChatMessageAction) does not
  // currently remove the mirrored Firestore doc, so a delete elsewhere
  // won't live-propagate here — flagged, not fixed, since that action file
  // was out of scope for this pass.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const messagesQuery = query(
          collection(getRealtimeDb(), 'group_chats', conversationId, 'messages'),
          orderBy('createdAt', 'asc'),
        );
        unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const change of snapshot.docChanges()) {
              if (change.type === 'removed') {
                byId.delete(change.doc.id);
                continue;
              }
              const data = change.doc.data() as FirestoreGroupChatMessage;
              byId.set(change.doc.id, {
                id: change.doc.id,
                user_id: data.senderId,
                content: data.content,
                created_at: data.createdAt,
              });
            }
            return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        });
      })
      .catch((error) => console.error('staff chat room realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!compact) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [optimisticMessages.length, compact]);

  const visibleMessages = compact ? optimisticMessages.slice(-3) : optimisticMessages;

  function handleOptimisticSend(content: string) {
    addOptimisticMessage({
      id: `optimistic-${Date.now()}`,
      user_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
    });
  }

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex h-full flex-col'}>
      <div className={compact ? 'flex flex-col gap-2' : 'flex-1 overflow-y-auto p-4'}>
        {visibleMessages.length === 0 ? (
          <p className="text-center text-sm text-white/60">{t('empty')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {visibleMessages.map((m) => (
              <StaffMessageItem
                key={m.id}
                message={m}
                sender={staffMap[m.user_id]}
                isOwn={m.user_id === currentUserId}
                isOptimistic={m.id.startsWith('optimistic-')}
              />
            ))}
            {!compact && <div ref={bottomRef} />}
          </div>
        )}
      </div>
      {canPost ? (
        <StaffMessageComposer conversationId={conversationId} onOptimisticSend={handleOptimisticSend} />
      ) : (
        <p className="border-t border-white/15 pt-3 text-center text-xs text-white/40 italic">
          {t('monitorOnly')}
        </p>
      )}
    </div>
  );
}
