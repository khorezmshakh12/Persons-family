'use client';

import { useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteMessageAction } from '@/lib/actions/chat';
import { cn } from '@/lib/utils';

export type ChatSender = { first_name: string; last_name: string; avatar_url: string | null };

export function MessageItem({
  message,
  sender,
  isOwn,
}: {
  message: { id: string; content: string; created_at: string };
  sender: ChatSender | undefined;
  isOwn: boolean;
}) {
  const t = useTranslations('chat');
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const name = sender ? `${sender.first_name} ${sender.last_name}` : '—';
  const initials = sender ? `${sender.first_name[0]}${sender.last_name[0]}` : '?';

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', message.id);
    startTransition(() => {
      deleteMessageAction(formData);
    });
  }

  return (
    <div className={cn('flex gap-3', isOwn && 'flex-row-reverse')}>
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={sender?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className={cn('group flex max-w-[75%] flex-col gap-1', isOwn && 'items-end')}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{name}</span>
          <span className="text-muted-foreground text-xs">
            {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
              isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted',
            )}
          >
            {message.content}
          </div>
          {isOwn && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={handleDelete}
              disabled={isPending}
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
