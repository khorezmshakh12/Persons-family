'use client';

import { useEffect, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { toggleChatEnabledAction } from '@/lib/actions/chat';
import { MessageBubble, type ChatSender } from './message-bubble';
import { ChatComposer } from './chat-composer';
import type { ActiveConversation, StaffChatMessage, StaffDirectoryEntry } from './types';
import type { ChatMediaType } from '@/lib/chat-media';

export function ConversationView({
  active,
  messages,
  staffMap,
  currentUserId,
  isAdmin,
  chatEnabled,
  onChatEnabledChange,
  onOptimisticSend,
}: {
  active: ActiveConversation;
  messages: StaffChatMessage[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
  isAdmin: boolean;
  chatEnabled: boolean;
  onChatEnabledChange: (next: boolean) => void;
  onOptimisticSend: (partial: { messageText?: string; mediaUrl?: string; mediaType?: ChatMediaType }) => void;
}) {
  const t = useTranslations('chatHub');
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isTogglePending, startToggleTransition] = useTransition();
  const isFamily = active.type === 'family';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const headerName = isFamily
    ? t('familyChat')
    : staffMap[active.userId]
      ? `${staffMap[active.userId].first_name} ${staffMap[active.userId].last_name}`
      : '—';
  const headerAvatar = isFamily ? null : (staffMap[active.userId]?.avatar_url ?? null);
  const headerInitials = isFamily
    ? '👨‍👩‍👧‍👦'
    : staffMap[active.userId]
      ? `${staffMap[active.userId].first_name[0]}${staffMap[active.userId].last_name[0]}`
      : '?';

  function handleToggleChatEnabled(next: boolean) {
    onChatEnabledChange(next);
    const formData = new FormData();
    formData.set('enabled', String(next));
    startToggleTransition(async () => {
      await toggleChatEnabledAction(formData);
    });
  }

  const canPost = isFamily ? chatEnabled : true;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/15 px-4 py-3">
        <Avatar className="size-9 shrink-0">
          {headerAvatar && <AvatarImage src={headerAvatar} alt="" />}
          <AvatarFallback>{headerInitials}</AvatarFallback>
        </Avatar>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{headerName}</h2>
        {isFamily && isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-white/60">{t('chatEnabled')}</span>
            <Switch checked={chatEnabled} onCheckedChange={handleToggleChatEnabled} disabled={isTogglePending} />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-white/60">{t('empty')}</p>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                sender={staffMap[m.sender_id]}
                isOwn={m.sender_id === currentUserId}
                isFamily={isFamily}
                isAdmin={isAdmin}
                isOptimistic={m.id.startsWith('optimistic-')}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {canPost ? (
        <ChatComposer receiverId={isFamily ? null : active.userId} onOptimisticSend={onOptimisticSend} />
      ) : (
        <p className="border-t border-white/15 p-4 text-center text-sm text-white/50">{t('chatDisabled')}</p>
      )}
    </div>
  );
}
