'use client';

import { memo, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteStaffChatMessageAction } from '@/lib/actions/staff-chat';
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
  message: { id: string; content: string; created_at: string };
  sender: ChatSender | undefined;
  isOwn: boolean;
  /** True for an optimistic message not yet confirmed by the server —
   * hides actions that need a real, persisted row id. */
  isOptimistic?: boolean;
}) {
  const t = useTranslations('staffChat');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const name = sender ? `${sender.first_name} ${sender.last_name}` : '—';
  const initials = sender ? `${sender.first_name[0]}${sender.last_name[0]}` : '?';

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', message.id);
    startTransition(() => {
      deleteStaffChatMessageAction(formData);
    });
  }

  return (
    <div className={cn('flex gap-3', isOwn && 'flex-row-reverse', isOptimistic && 'opacity-60')}>
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn('group flex max-w-[80%] flex-col gap-1', isOwn && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-xs text-white/50">
            {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap',
              isOwn ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-white' : 'bg-white/10',
            )}
          >
            {message.content}
          </div>
          {isOwn && !isOptimistic && (
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
          )}
        </div>
      </div>
    </div>
  );
}

export const StaffMessageItem = memo(StaffMessageItemComponent);
