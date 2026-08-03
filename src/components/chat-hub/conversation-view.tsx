'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MessageSquarePlus, MessagesSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { sendChatRequestAction } from '@/lib/actions/staff-chats';
import { MessageBubble, type ChatSender } from './message-bubble';
import { ChatComposer } from './chat-composer';
import type { ActiveConversation, ChatQuote, ConversationState, StaffChatMessage } from './types';
import type { ChatMediaType } from '@/lib/chat-media';
import type { SentStaffChatMessage } from '@/lib/actions/staff-chats';

function toQuote(message: StaffChatMessage, senderName: string): ChatQuote {
  return { id: message.id, senderName, text: message.message_text, mediaType: message.media_type };
}

export function ConversationView({
  active,
  conversationState,
  messages,
  staffMap,
  currentUserId,
  onSendRequest,
  onOptimisticSend,
  onConfirmedSend,
}: {
  active: ActiveConversation;
  conversationState: ConversationState;
  messages: StaffChatMessage[];
  staffMap: Record<string, ChatSender>;
  currentUserId: string;
  /** Refresh conversation state after a request is sent (moves 'none' -> 'pendingOutgoing'/'accepted'). */
  onSendRequest: () => void;
  onOptimisticSend: (partial: {
    messageText?: string;
    mediaUrl?: string;
    mediaType?: ChatMediaType;
    replyToId?: string;
  }) => void;
  onConfirmedSend: (message: SentStaffChatMessage) => void;
}) {
  const t = useTranslations('chatHub');
  const [replyTarget, setReplyTarget] = useState<ChatQuote | null>(null);
  const [isRequestPending, startRequestTransition] = useTransition();
  const messageMap = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  // Refs, not deps: handleReply must stay referentially stable across
  // renders (via the empty dep array below) so MessageBubble.memo isn't
  // defeated for every bubble every time a new message arrives — see the
  // memoization comment on MessageBubble itself.
  const messagesRef = useRef(messages);
  const staffMapRef = useRef(staffMap);
  useEffect(() => {
    messagesRef.current = messages;
    staffMapRef.current = staffMap;
  });
  const handleReply = useCallback((messageId: string) => {
    const target = messagesRef.current.find((m) => m.id === messageId);
    if (!target) return;
    const senderName = staffMapRef.current[target.sender_id]
      ? `${staffMapRef.current[target.sender_id].first_name} ${staffMapRef.current[target.sender_id].last_name}`
      : '—';
    setReplyTarget(toQuote(target, senderName));
  }, []);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user was already scrolled near the bottom right
  // before this render — read at effect time, not at scroll time, so a
  // typing-indicator re-render or any other minor state change can't
  // retroactively change what "near bottom" meant when the message arrived.
  const isNearBottomRef = useRef(true);
  const conversationKey = active?.userId ?? null;
  const previousMessageCount = useRef(0);
  // Sentinel that never matches a real conversation key, so the very first
  // render is always treated as a "conversation changed" — the chat should
  // open scrolled to the latest message, not wherever a fresh scroll
  // container happens to start.
  const previousConversationKey = useRef<string | null>(null);

  function handleScroll() {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  // Switching conversations always jumps to the bottom (a fresh chat should
  // open where the latest message is), but within the same conversation a
  // new message only auto-scrolls if the user hadn't scrolled up to read
  // history — otherwise it would yank them back down mid-read.
  useEffect(() => {
    const conversationChanged = previousConversationKey.current !== conversationKey;
    const gainedMessages = messages.length > previousMessageCount.current;
    const lastMessage = messages[messages.length - 1];
    const ownNewMessage = gainedMessages && lastMessage?.sender_id === currentUserId;

    if (conversationChanged || (gainedMessages && isNearBottomRef.current) || ownNewMessage) {
      // `block: 'nearest'` keeps this scroll confined to the message
      // container itself — the default `block: 'start'` asks every
      // scrollable ancestor (including the page) to reposition so the
      // target aligns to an edge, which is what was yanking the whole
      // window on every conversation switch.
      bottomRef.current?.scrollIntoView({
        behavior: conversationChanged ? 'auto' : 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
      isNearBottomRef.current = true;
    }

    previousMessageCount.current = messages.length;
    previousConversationKey.current = conversationKey;
  }, [messages, conversationKey, currentUserId]);

  // A reply draft is scoped to whichever conversation it was started in —
  // switching to a different DM shouldn't carry a stale quote (and stale
  // reply_to_id) into an unrelated one.
  useEffect(() => {
    setReplyTarget(null);
  }, [conversationKey]);

  function senderNameFor(userId: string) {
    return staffMap[userId] ? `${staffMap[userId].first_name} ${staffMap[userId].last_name}` : '—';
  }

  function handleSendRequest() {
    if (!active) return;
    startRequestTransition(async () => {
      const result = await sendChatRequestAction(active.userId);
      if (result.error) toast.error(t(`errors.${result.error}`));
      else onSendRequest();
    });
  }

  if (!active) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <MessagesSquare className="size-8 text-white/30" />
        <p className="text-sm text-white/50">{t('selectContact')}</p>
      </div>
    );
  }

  const contact = staffMap[active.userId];
  const headerName = contact ? `${contact.first_name} ${contact.last_name}` : '—';
  const headerAvatar = contact?.avatar_url ?? null;
  const headerInitials = contact ? `${contact.first_name[0]}${contact.last_name[0]}` : '?';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-white/15 px-4 py-3">
        <Avatar className="size-9 shrink-0">
          {headerAvatar && <AvatarImage src={headerAvatar} alt="" />}
          <AvatarFallback>{headerInitials}</AvatarFallback>
        </Avatar>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-white">{headerName}</h2>
      </div>

      {conversationState.kind === 'none' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <MessageSquarePlus className="size-8 text-white/30" />
          <p className="text-sm text-white/60">{t('requests.startPrompt', { name: headerName })}</p>
          <Button type="button" onClick={handleSendRequest} disabled={isRequestPending}>
            {isRequestPending ? t('requests.sending') : t('requests.sendRequest')}
          </Button>
        </div>
      ) : conversationState.kind === 'pendingOutgoing' ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <MessageSquarePlus className="size-8 text-white/30" />
          <p className="text-sm text-white/60">
            {t('requests.waitingForApproval', { name: headerName })}
          </p>
        </div>
      ) : (
        <>
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            {messages.length === 0 ? (
              <p className="text-center text-sm text-white/60">{t('empty')}</p>
            ) : (
              <div className="flex flex-col gap-4">
                {messages.map((m) => {
                  const repliedMessage = m.reply_to_id ? messageMap.get(m.reply_to_id) : undefined;
                  return (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      sender={staffMap[m.sender_id]}
                      isOwn={m.sender_id === currentUserId}
                      currentUserId={currentUserId}
                      isOptimistic={m.id.startsWith('optimistic-')}
                      repliedQuote={
                        repliedMessage
                          ? toQuote(repliedMessage, senderNameFor(repliedMessage.sender_id))
                          : null
                      }
                      onReply={handleReply}
                    />
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <ChatComposer
            receiverId={active.userId}
            onOptimisticSend={onOptimisticSend}
            onConfirmedSend={onConfirmedSend}
            replyTarget={replyTarget}
            onClearReply={() => setReplyTarget(null)}
          />
        </>
      )}
    </div>
  );
}
