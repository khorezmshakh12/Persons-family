'use client';

import { memo, useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Trash2, Check, CheckCheck, Reply, SmilePlus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteStaffChatAction, toggleStaffChatReactionAction } from '@/lib/actions/staff-chats';
import { cn } from '@/lib/utils';
import type { ChatQuote, StaffChatMessage } from './types';

export type ChatSender = { first_name: string; last_name: string; avatar_url: string | null };

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🔥'];

// Memoized: ChatHubClient's realtime handlers append to the message array
// with a spread (`[...prev, message]`), which preserves object identity for
// every existing message — so on each new message, every *other* bubble's
// props are referentially unchanged and this skips re-rendering them.
function MessageBubbleComponent({
  message,
  sender,
  isOwn,
  currentUserId,
  repliedQuote,
  onReply,
  isOptimistic = false,
}: {
  message: StaffChatMessage;
  sender: ChatSender | undefined;
  isOwn: boolean;
  currentUserId: string;
  /** The message this one is replying to, already resolved by
   * ConversationView — null if it's not a reply, undefined if the original
   * isn't loaded in this conversation's current message window. */
  repliedQuote: ChatQuote | null | undefined;
  /** Stable across renders (see ConversationView.handleReply) — takes the
   * message id rather than a pre-bound closure so this component's own
   * memoization isn't defeated by a fresh function identity every render. */
  onReply: (messageId: string) => void;
  isOptimistic?: boolean;
}) {
  const t = useTranslations('chatHub');
  const format = useFormatter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isReactionPending, startReactionTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const name = sender ? `${sender.first_name} ${sender.last_name}` : '—';
  const initials = sender ? `${sender.first_name[0]}${sender.last_name[0]}` : '?';
  const reactionEntries = Object.entries(message.reactions ?? {}).filter(
    ([, users]) => users.length > 0,
  );

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', message.id);
    startDeleteTransition(() => {
      deleteStaffChatAction(formData);
    });
  }

  // No local optimistic update — the security-definer RPC's realtime UPDATE
  // echo (same path pin already relies on) is what actually lands the
  // change, since the server is the only side that knows the post-toggle
  // state of every other reactor on this emoji.
  function handleToggleReaction(emoji: string) {
    setPickerOpen(false);
    const formData = new FormData();
    formData.set('id', message.id);
    formData.set('emoji', emoji);
    startReactionTransition(() => {
      toggleStaffChatReactionAction(formData);
    });
  }

  return (
    <div className={cn('flex gap-3', isOwn && 'flex-row-reverse', isOptimistic && 'opacity-60')}>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn('group flex max-w-[75%] flex-col gap-1', isOwn && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {name}
          </span>
          <span className="text-xs text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isOwn && !isOptimistic && (
            <span aria-label={message.is_read ? t('readReceipt.read') : t('readReceipt.unread')}>
              {message.is_read ? (
                <CheckCheck className="size-3.5 text-sky-300" />
              ) : (
                <Check className="size-3.5 text-white/50" />
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'flex flex-col gap-2 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
              isOwn
                ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-white'
                : 'bg-white/10 text-white',
            )}
          >
            {message.reply_to_id && repliedQuote && (
              <div
                className={cn(
                  'flex flex-col gap-0.5 rounded-lg border-l-2 px-2 py-1 text-xs',
                  isOwn ? 'border-white/50 bg-black/10' : 'border-teal-300 bg-black/20',
                )}
              >
                <span className={cn('font-medium', isOwn ? 'text-white/90' : 'text-teal-200')}>
                  {repliedQuote.senderName}
                </span>
                <span className={cn('truncate', isOwn ? 'text-white/70' : 'text-white/60')}>
                  {repliedQuote.text ?? t(`mediaLabel.${repliedQuote.mediaType}`)}
                </span>
              </div>
            )}
            {message.reply_to_id && !repliedQuote && (
              <span className="text-xs italic opacity-60">{t('originalMessageUnavailable')}</span>
            )}
            {message.media_type === 'image' && message.media_url && (
              <Image
                src={message.media_url}
                alt=""
                width={240}
                height={240}
                unoptimized
                className="max-h-64 w-auto rounded-lg object-cover"
              />
            )}
            {message.media_type === 'video' && message.media_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={message.media_url} controls className="max-h-64 max-w-full rounded-lg" />
            )}
            {message.media_type === 'voice' && message.media_url && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio src={message.media_url} controls className="h-10 max-w-full" />
            )}
            {message.message_text && <span>{message.message_text}</span>}
          </div>
          {!isOptimistic && (
            <div
              className={cn(
                'flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100',
                pickerOpen && 'opacity-100',
              )}
            >
              <div className="relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setPickerOpen((v) => !v)}
                  disabled={isReactionPending}
                  aria-label={t('addReaction')}
                >
                  <SmilePlus className="size-3.5" />
                </Button>
                {pickerOpen && (
                  <div
                    className={cn(
                      'absolute bottom-full z-10 mb-1 flex items-center gap-1 rounded-full border border-white/20 bg-slate-900/95 px-2 py-1 shadow-xl backdrop-blur-md',
                      isOwn ? 'right-0' : 'left-0',
                    )}
                  >
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(emoji)}
                        className="tap-scale rounded-full p-1 text-base transition-transform duration-200 ease-bounce hover:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onReply(message.id)}
                aria-label={t('reply')}
              >
                <Reply className="size-3.5" />
              </Button>
              {isOwn && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleDelete}
                  disabled={isDeletePending}
                  aria-label={t('delete')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
        {reactionEntries.length > 0 && (
          <div className={cn('flex flex-wrap gap-1', isOwn && 'justify-end')}>
            {reactionEntries.map(([emoji, users]) => {
              const reactedByMe = users.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(emoji)}
                  disabled={isReactionPending}
                  className={cn(
                    'tap-scale flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs transition-colors',
                    reactedByMe
                      ? 'border-teal-300 bg-teal-400/20 text-teal-100'
                      : 'border-white/20 bg-white/10 text-white/70 hover:bg-white/20',
                  )}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
