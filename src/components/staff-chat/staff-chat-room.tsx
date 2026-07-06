'use client';

import { useEffect, useOptimistic, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { StaffMessageItem, type ChatSender } from './staff-message-item';
import { StaffMessageComposer } from './staff-message-composer';

type Message = { id: string; user_id: string; content: string; created_at: string };

export function StaffChatRoom({
  conversationId,
  initialMessages,
  staffMap,
  currentUserId,
  compact = false,
}: {
  conversationId: string;
  initialMessages: Message[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
  /** Snippet mode for embedding inside a group page — shows only the last
   * few messages and skips auto-scroll, instead of the full-height room
   * used by the standalone /staff-chat page. */
  compact?: boolean;
}) {
  const t = useTranslations('staffChat');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage: Message) => [...state, newMessage],
  );
  const bottomRef = useRef<HTMLDivElement>(null);

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
        .channel(`staff_chat_${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'staff_chat_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const newMessage = payload.new as Message;
            setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
          },
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'staff_chat_messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const deletedId = (payload.old as { id: string }).id;
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
      <StaffMessageComposer conversationId={conversationId} onOptimisticSend={handleOptimisticSend} />
    </div>
  );
}
