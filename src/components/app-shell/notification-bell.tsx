'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type UnreadChatItem = {
  id: string;
  senderId: string;
  messageText: string | null;
  createdAt: string;
};

export type UnseenIssueItem = {
  id: string;
  title: string;
  createdAt: string;
};

export function NotificationBell({
  userId,
  initialUnreadChats,
  initialUnseenIssues,
  profileNames,
}: {
  userId: string;
  initialUnreadChats: UnreadChatItem[];
  initialUnseenIssues: UnseenIssueItem[];
  profileNames: Record<string, string>;
}) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const [unreadChats, setUnreadChats] = useState(initialUnreadChats);
  const [unseenIssues, setUnseenIssues] = useState(initialUnseenIssues);
  const [open, setOpen] = useState(false);

  // Realtime keeps the bell live without a refetch: new DMs/reassigned
  // issues addressed to this user push the badge up immediately, and the
  // existing mark-read/mark-seen flows (opening a DM, visiting /issues)
  // push it back down via the UPDATE branch below.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('notification_bell')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'staff_chats', filter: `receiver_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as {
              id: string;
              sender_id: string;
              message_text: string | null;
              created_at: string;
              is_read: boolean;
            };
            if (row.is_read) return;
            setUnreadChats((prev) =>
              prev.some((m) => m.id === row.id)
                ? prev
                : [
                    { id: row.id, senderId: row.sender_id, messageText: row.message_text, createdAt: row.created_at },
                    ...prev,
                  ],
            );
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'staff_chats', filter: `receiver_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; is_read: boolean };
            if (row.is_read) setUnreadChats((prev) => prev.filter((m) => m.id !== row.id));
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'issues', filter: `assigned_to=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; title: string; created_at: string; is_seen: boolean };
            if (row.is_seen) return;
            setUnseenIssues((prev) =>
              prev.some((i) => i.id === row.id)
                ? prev
                : [{ id: row.id, title: row.title, createdAt: row.created_at }, ...prev],
            );
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'issues', filter: `assigned_to=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; title: string; created_at: string; is_seen: boolean };
            setUnseenIssues((prev) => {
              if (row.is_seen) return prev.filter((i) => i.id !== row.id);
              if (prev.some((i) => i.id === row.id)) return prev;
              return [{ id: row.id, title: row.title, createdAt: row.created_at }, ...prev];
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  const totalCount = unreadChats.length + unseenIssues.length;

  // One preview row per sender (their latest unread message), newest first.
  const chatPreviews = Array.from(
    unreadChats
      .reduce((map, m) => {
        const existing = map.get(m.senderId);
        if (!existing || existing.createdAt < m.createdAt) map.set(m.senderId, m);
        return map;
      }, new Map<string, UnreadChatItem>())
      .values(),
  )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  const issuePreviews = [...unseenIssues].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <button
            type="button"
            aria-label={t('title')}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Bell className="size-4.5" />
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.85)]">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner align="end" sideOffset={10} className="z-50 outline-none">
          <PopoverPrimitive.Popup className={cn(GLASS_CARD, 'flex w-80 max-w-[90vw] flex-col gap-3 p-4')}>
            <h3 className="text-sm font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h3>
            {totalCount === 0 ? (
              <p className="text-sm text-white/60">{t('empty')}</p>
            ) : (
              <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
                {chatPreviews.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                      {t('messages')}
                    </p>
                    {chatPreviews.map((m) => (
                      <Link
                        key={m.id}
                        href="/chat"
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="text-sm font-medium text-white">
                          {profileNames[m.senderId] ?? t('unknownSender')}
                        </span>
                        <span className="truncate text-xs text-white/60">{m.messageText ?? t('mediaMessage')}</span>
                      </Link>
                    ))}
                  </div>
                )}
                {issuePreviews.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                      {t('tasks')}
                    </p>
                    {issuePreviews.map((issue) => (
                      <Link
                        key={issue.id}
                        href="/issues"
                        onClick={() => setOpen(false)}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="truncate text-sm font-medium text-white">{issue.title}</span>
                        <span className="text-xs text-white/60">{format.relativeTime(new Date(issue.createdAt))}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
