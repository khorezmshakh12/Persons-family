'use client';

import { memo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { useFormatter, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Trash2, Check, CheckCheck, Reply, SmilePlus, Pencil, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteStaffChatAction, toggleStaffChatReactionAction, updateStaffChatAction } from '@/lib/actions/staff-chats';
import { cn } from '@/lib/utils';
import { Link } from '@/i18n/navigation';
import type { ChatQuote, StaffChatMessage } from './types';
import { taskHref } from './chat-kit';

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
  grouped = false,
  tail = true,
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
  /** Same sender as the message above within a few minutes — Telegram
   * style: no repeated avatar / name, tighter spacing. */
  grouped?: boolean;
  /** Last of its group — gets the bubble tail and the avatar. */
  tail?: boolean;
}) {
  const t = useTranslations('chatHub');
  const format = useFormatter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isReactionPending, startReactionTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Inline edit of one's own text (owner, 2026-10-06). shownText/editedAt
  // show the saved edit immediately; the realtime mirror then confirms it.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [shownText, setShownText] = useState<string | null>(null);
  const [editedAt, setEditedAt] = useState<string | null>(null);
  const [isEditPending, startEditTransition] = useTransition();
  function startEdit() {
    setDraft(shownText ?? message.message_text ?? '');
    setEditing(true);
  }
  function saveEdit() {
    const text = draft.trim();
    if (!text) return;
    if (text === (shownText ?? message.message_text)) return setEditing(false);
    startEditTransition(async () => {
      const res = await updateStaffChatAction({ id: message.id, messageText: text });
      if (res.error) {
        toast.error('Xabarni tahrirlab bo‘lmadi');
        return;
      }
      setShownText(text);
      setEditedAt(res.editedAt ?? new Date().toISOString());
      setEditing(false);
    });
  }
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
    <motion.div
      layout
      initial={isOptimistic ? { opacity: 0, y: 14, scale: 0.94 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      data-own={isOwn}
      id={`msg-${message.id}`}
      className={cn(
        'flex scroll-mt-24 items-end gap-2 rounded-xl transition-colors duration-700',
        grouped ? 'mt-0.5' : 'mt-3',
        !isOptimistic && 'ch-row',
        isOwn && 'flex-row-reverse',
        isOptimistic && 'opacity-60',
      )}
    >
      {/* Avatar only on the last bubble of a run (others keep the gutter). */}
      {!isOwn &&
        (tail ? (
          <Avatar className="size-8 shrink-0">
            <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="w-8 shrink-0" aria-hidden />
        ))}
      <div className={cn('group flex min-w-0 max-w-[78%] flex-col gap-1', isOwn && 'items-end')}>
        <div className={cn('flex items-center gap-1', isOwn && 'flex-row-reverse')}>
          <div
            className={cn(
              'ch-bubble flex min-w-0 flex-col gap-1.5 px-3 pt-2 pb-1.5 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]',
              isOwn ? 'ch-own' : 'ch-other',
              tail && 'ch-tail',
            )}
          >
            {!isOwn && !grouped && <span className="ch-name text-xs font-semibold">{name}</span>}
            {message.reply_to_id && repliedQuote && (
              <button
                type="button"
                onClick={() => {
                  // Jump to the quoted message and flash it briefly.
                  const el = document.getElementById(`msg-${message.reply_to_id}`);
                  if (!el) return;
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  el.classList.add('bg-au-accent-soft');
                  setTimeout(() => el.classList.remove('bg-au-accent-soft'), 1400);
                }}
                className="flex min-w-0 flex-col gap-0.5 rounded-lg border-l-2 border-au-faint bg-au-card-2 px-2 py-1 text-left text-xs hover:brightness-95"
              >
                <span className={cn('font-medium', isOwn ? 'text-au-ink' : 'text-au-muted')}>
                  {repliedQuote.senderName}
                </span>
                <span className="line-clamp-2 text-au-muted">
                  {repliedQuote.text ?? t(`mediaLabel.${repliedQuote.mediaType}`)}
                </span>
              </button>
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
              <video src={message.media_url} controls className="max-h-64 max-w-full rounded-lg" />
            )}
            {message.media_type === 'voice' && message.media_url && (
              <audio src={message.media_url} controls className="h-10 max-w-full" />
            )}
            {editing ? (
              <span className="flex min-w-[220px] flex-col gap-1.5 whitespace-normal">
                <textarea
                  autoFocus
                  value={draft}
                  maxLength={2000}
                  rows={Math.min(6, Math.max(2, draft.split(/\n/).length))}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') setEditing(false);
                  }}
                  className="w-full resize-none rounded-lg border border-au-line bg-au-card px-2 py-1.5 text-sm text-au-ink outline-none focus:border-au-accent"
                />
                <span className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setEditing(false)} className="rounded-md px-2 py-0.5 text-xs font-semibold text-au-muted hover:text-au-ink">
                    Bekor
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    disabled={isEditPending || !draft.trim()}
                    className="rounded-md bg-au-ink px-2.5 py-0.5 text-xs font-semibold text-au-card disabled:opacity-50"
                  >
                    Saqlash
                  </button>
                </span>
              </span>
            ) : (
              (shownText ?? message.message_text) && <span>{shownText ?? message.message_text}</span>
            )}
            {/* Time + read ticks inside the bubble, bottom-right (Telegram). */}
            <span className="ch-meta -mb-0.5 flex items-center justify-end gap-1 self-end text-[11px] leading-none">
              {(editedAt ?? message.edited_at) && <span className="italic opacity-80">tahrirlangan ·</span>}
              {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
              {isOwn && !isOptimistic && (
                <span aria-label={message.is_read ? t('readReceipt.read') : t('readReceipt.unread')}>
                  {message.is_read ? <CheckCheck className="ch-read size-3.5" /> : <Check className="size-3.5" />}
                </span>
              )}
            </span>
          </div>
          {!isOptimistic && (
            <div
              className={cn(
                // Touch has no hover state — hiding these behind
                // group-hover would make them unreachable on a phone, so
                // they're always visible below `sm:` and only hover-reveal
                // (the tidier desktop behavior) at `sm:` and up.
                'flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100',
                pickerOpen && 'sm:opacity-100',
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
                      'absolute bottom-full z-10 mb-1 flex items-center gap-1 rounded-full border border-au-line bg-au-card px-2 py-1 shadow-au-card',
                      isOwn ? 'right-0' : 'left-0',
                    )}
                  >
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(emoji)}
                        className="tap-scale rounded-full p-1 text-base transition-transform duration-200 ease-bounce"
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
              {message.message_text && (
                <Link
                  href={taskHref(message.message_text, `${name}, shaxsiy chat`)}
                  aria-label="Vazifaga aylantirish"
                  title="Vazifaga aylantirish"
                  className="inline-flex size-7 items-center justify-center rounded-md text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                >
                  <ClipboardList className="size-3.5" />
                </Link>
              )}
              {isOwn && message.message_text && (
                <Button type="button" variant="ghost" size="icon-sm" onClick={startEdit} aria-label="Tahrirlash">
                  <Pencil className="size-3.5" />
                </Button>
              )}
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
                      ? 'border-au-faint bg-au-card-2 text-au-ink'
                      : 'border-au-line bg-au-card text-au-muted hover:bg-au-card-2',
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
    </motion.div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
