'use client';

import { useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import Image from 'next/image';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { deleteStaffChatAction, toggleStaffChatPinAction } from '@/lib/actions/staff-chats';
import { cn } from '@/lib/utils';
import type { StaffChatMessage } from './types';

export type ChatSender = { first_name: string; last_name: string; avatar_url: string | null };

export function MessageBubble({
  message,
  sender,
  isOwn,
  isFamily,
  isAdmin,
  isOptimistic = false,
}: {
  message: StaffChatMessage;
  sender: ChatSender | undefined;
  isOwn: boolean;
  isFamily: boolean;
  isAdmin: boolean;
  isOptimistic?: boolean;
}) {
  const t = useTranslations('chatHub');
  const format = useFormatter();
  const [isDeletePending, startDeleteTransition] = useTransition();
  const [isPinPending, startPinTransition] = useTransition();
  const name = sender ? `${sender.first_name} ${sender.last_name}` : '—';
  const initials = sender ? `${sender.first_name[0]}${sender.last_name[0]}` : '?';
  const isPinned = !!message.pinned_at;

  function handleDelete() {
    const formData = new FormData();
    formData.set('id', message.id);
    startDeleteTransition(() => {
      deleteStaffChatAction(formData);
    });
  }

  function handleTogglePin() {
    const formData = new FormData();
    formData.set('id', message.id);
    formData.set('pin', String(!isPinned));
    startPinTransition(() => {
      toggleStaffChatPinAction(formData);
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
          <span className="text-xs font-medium text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{name}</span>
          <span className="text-xs text-white/90 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {format.dateTime(new Date(message.created_at), { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isPinned && <Pin className="size-3 text-teal-300" />}
        </div>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'flex flex-col gap-2 rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap',
              isOwn ? 'bg-gradient-to-r from-teal-400 to-emerald-500 text-white' : 'bg-white/10 text-white',
            )}
          >
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
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {isFamily && isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleTogglePin}
                  disabled={isPinPending}
                  aria-label={isPinned ? t('unpin') : t('pin')}
                >
                  {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                </Button>
              )}
              {(isOwn || (isFamily && isAdmin)) && (
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
      </div>
    </div>
  );
}
