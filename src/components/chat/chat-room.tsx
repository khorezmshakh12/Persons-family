'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { MessageItem, type ChatSender } from './message-item';
import { MessageComposer } from './message-composer';

type Message = { id: string; user_id: string; content: string; created_at: string };

export function ChatRoom({
  initialMessages,
  staffMap,
  currentUserId,
}: {
  initialMessages: Message[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
}) {
  const t = useTranslations('chat');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // The realtime socket authorizes as `anon` until the user's JWT is
      // explicitly handed to it — without this, RLS silently drops every
      // change event instead of erroring, since `chat_select_all` only
      // grants to the `authenticated` role.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('chat_messages_changes')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const newMessage = payload.new as Message;
            setMessages((prev) =>
              prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage],
            );
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'chat_messages' },
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
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground text-center text-sm">{t('empty')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                sender={staffMap[m.user_id]}
                isOwn={m.user_id === currentUserId}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <MessageComposer />
    </div>
  );
}
