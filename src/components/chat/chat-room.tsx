'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Pin } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toggleChatEnabledAction } from '@/lib/actions/chat';
import { Switch } from '@/components/ui/switch';
import { MessageItem, type ChatSender } from './message-item';
import { MessageComposer } from './message-composer';

type Message = { id: string; user_id: string; content: string; created_at: string; pinned_at: string | null };

export function ChatRoom({
  initialMessages,
  staffMap,
  currentUserId,
  isAdmin,
  initialChatEnabled,
}: {
  initialMessages: Message[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
  isAdmin: boolean;
  initialChatEnabled: boolean;
}) {
  const t = useTranslations('chat');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [chatEnabled, setChatEnabled] = useState(initialChatEnabled);
  const [isTogglePending, startToggleTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // The realtime socket authorizes as `anon` until the user's JWT is
      // explicitly handed to it — without this, RLS silently drops every
      // change event instead of erroring, since these tables' select
      // policies only grant to the `authenticated` role.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('chat_room_changes')
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
          { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
          (payload) => {
            const updated = payload.new as Message;
            setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
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
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'app_settings' },
          (payload) => {
            const updated = payload.new as { chat_enabled: boolean };
            setChatEnabled(updated.chat_enabled);
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

  const pinnedMessages = messages
    .filter((m) => m.pinned_at)
    .sort((a, b) => new Date(b.pinned_at!).getTime() - new Date(a.pinned_at!).getTime());

  function handleToggleChatEnabled(next: boolean) {
    setChatEnabled(next);
    const formData = new FormData();
    formData.set('enabled', String(next));
    startToggleTransition(async () => {
      await toggleChatEnabledAction(formData);
    });
  }

  return (
    <div className="flex h-full flex-col">
      {isAdmin && (
        <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
          <span className="text-muted-foreground text-sm">{t('enableChat')}</span>
          <Switch
            checked={chatEnabled}
            onCheckedChange={handleToggleChatEnabled}
            disabled={isTogglePending}
          />
        </div>
      )}

      {pinnedMessages.length > 0 && (
        <div className="bg-muted/50 flex flex-col gap-2 border-b p-3">
          {pinnedMessages.map((m) => (
            <div key={m.id} className="flex items-start gap-2 text-sm">
              <Pin className="text-brand mt-0.5 size-3.5 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium">
                  {staffMap[m.user_id] ? `${staffMap[m.user_id].first_name} ${staffMap[m.user_id].last_name}` : '—'}
                </span>
                <span className="text-muted-foreground line-clamp-2 break-words">{m.content}</span>
              </div>
            </div>
          ))}
        </div>
      )}

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
                isAdmin={isAdmin}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {chatEnabled ? (
        <MessageComposer />
      ) : (
        <p className="text-muted-foreground border-t p-4 text-center text-sm">{t('chatDisabled')}</p>
      )}
    </div>
  );
}
