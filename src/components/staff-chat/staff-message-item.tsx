'use client';

import { memo, useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { useFormatter, useTranslations } from 'next-intl';
import { Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteStaffChatMessageAction, updateStaffChatMessageAction } from '@/lib/actions/staff-chat';
import { cn } from '@/lib/utils';

export type ChatSender = { first_name: string; last_name: string; avatar_url: string | null };

// Memoized for the same reason as chat-hub's MessageBubble — StaffChatRoom
// appends to its message array with a spread, so unaffected messages keep
// referentially stable props and this skips re-rendering them.
function StaffMessageItemComponent({
  message,
  sender,
  isOwn,
  isOptimistic = false,
}: {
  message: { id: string; content: string; created_at: string; edited_at?: string | null };
  sender: ChatSender | undefined;
  isOwn: boolean;
  /** True for an optimistic message not yet confirmed by the server —
   * hides actions that need a real, persisted row id. */
  isOptimistic?: boolean;
}) {
  const t = useTranslations('staffChat');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const [isEditPending, startEditTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [shownText, setShownText] = useState<string | null>(null);
  const [editedAt, setEditedAt] = useState<string | null>(message.edited_at ?? null);
  const name = sender ? `${sender.first_name} ${sender.last_name}` : '—';
  const initials = sender ? `${sender.first_name[0]}${sender.last_name[0]}` : '?';

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', message.id);
    startTransition(() => {
      deleteStaffChatMessageAction(formData);
    });
  }

  function startEdit() {
    setDraft(shownText ?? message.content ?? '');
    setEditing(true);
  }

  function saveEdit() {
    const text = draft.trim();
    if (!text) return;
    if (text === (shownText ?? message.content)) return setEditing(false);
    startEditTransition(async () => {
      const formData = new FormData();
      formData.set('id', message.id);
      formData.set('content', text);
      const res = await updateStaffChatMessageAction(undefined, formData);
      if (res?.error) {
        toast.error('Xabarni tahrirlab bo\'lmadi');
        return;
      }
      setShownText(text);
      setEditedAt(new Date().toISOString());
      setEditing(false);
    });
  }

  return (
    <motion.div
      layout
      initial={isOptimistic ? { opacity: 0, y: 14, scale: 0.94 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn('flex gap-3', isOwn && 'flex-row-reverse', isOptimistic && 'opacity-60')}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn('group flex max-w-[80%] flex-col gap-1', isOwn && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-xs text-au-muted">
            {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
          </span>
          {(editedAt || message.edited_at) && <span className="text-xs italic text-au-muted">tahrirlangan</span>}
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap [overflow-wrap:anywhere]',
              isOwn ? 'bg-white text-black' : 'bg-au-card',
            )}
          >
            {editing ? (
              <span className="flex flex-col gap-1.5">
                <textarea
                  autoFocus
                  value={draft}
                  maxLength={2000}
                  rows={Math.min(4, Math.max(2, draft.split(/\n/).length))}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === 'Escape') setEditing(false);
                  }}
                  className="w-full min-w-[220px] resize-none rounded-lg border border-au-line bg-au-card px-2 py-1.5 text-sm text-au-ink outline-none focus:border-au-accent"
                />
                <span className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-md px-2 py-0.5 text-xs font-semibold text-au-muted hover:text-au-ink"
                  >
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
              shownText ?? message.content
            )}
          </div>
          {isOwn && !isOptimistic && !editing && (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={startEdit}
                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={t('edit')}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={handleDelete}
                disabled={isPending}
                className="opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={t('delete')}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export const StaffMessageItem = memo(StaffMessageItemComponent);
