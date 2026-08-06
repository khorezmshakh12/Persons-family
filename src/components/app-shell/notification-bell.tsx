'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { toast } from 'sonner';
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

export type UnseenTaskItem = {
  id: string;
  title: string;
  createdAt: string;
};

export type UnseenWarningItem = {
  id: string;
  reason: string;
  createdAt: string;
};

export function NotificationBell({
  userId,
  initialUnreadChats,
  initialUnseenIssues,
  initialUnseenTasks,
  initialUnseenWarnings,
  profileNames,
}: {
  userId: string;
  initialUnreadChats: UnreadChatItem[];
  initialUnseenIssues: UnseenIssueItem[];
  initialUnseenTasks: UnseenTaskItem[];
  initialUnseenWarnings: UnseenWarningItem[];
  profileNames: Record<string, string>;
}) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [unreadChats, setUnreadChats] = useState(initialUnreadChats);
  const [unseenIssues, setUnseenIssues] = useState(initialUnseenIssues);
  const [unseenTasks, setUnseenTasks] = useState(initialUnseenTasks);
  const [unseenWarnings, setUnseenWarnings] = useState(initialUnseenWarnings);
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
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; title: string; created_at: string; is_seen: boolean };
            if (row.is_seen) return;
            setUnseenTasks((prev) =>
              prev.some((task) => task.id === row.id)
                ? prev
                : [{ id: row.id, title: row.title, createdAt: row.created_at }, ...prev],
            );
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; title: string; created_at: string; is_seen: boolean };
            setUnseenTasks((prev) => {
              if (row.is_seen) return prev.filter((task) => task.id !== row.id);
              if (prev.some((task) => task.id === row.id)) return prev;
              return [{ id: row.id, title: row.title, createdAt: row.created_at }, ...prev];
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'staff_warnings', filter: `staff_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; reason: string; created_at: string; is_seen: boolean };
            if (row.is_seen) return;
            setUnseenWarnings((prev) =>
              prev.some((w) => w.id === row.id)
                ? prev
                : [{ id: row.id, reason: row.reason, createdAt: row.created_at }, ...prev],
            );
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'staff_warnings', filter: `staff_id=eq.${userId}` },
          (payload) => {
            const row = payload.new as { id: string; reason: string; created_at: string; is_seen: boolean };
            setUnseenWarnings((prev) => {
              if (row.is_seen) return prev.filter((w) => w.id !== row.id);
              if (prev.some((w) => w.id === row.id)) return prev;
              return [{ id: row.id, reason: row.reason, createdAt: row.created_at }, ...prev];
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

  const totalCount = unreadChats.length + unseenIssues.length + unseenTasks.length + unseenWarnings.length;

  // A little attention wiggle on the bell itself (not just the badge) the
  // moment a *new* item lands — skips the initial mount (that's just the
  // server-rendered starting count, not a "new" arrival) and skips drops
  // (marking something read shouldn't shake anything). Bumping shakeKey
  // remounts the icon under a fresh `key`, which restarts the CSS animation
  // — simpler than juggling animation-restart timers.
  const previousCountRef = useRef<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  useEffect(() => {
    if (previousCountRef.current !== null && totalCount > previousCountRef.current) {
      setShakeKey((k) => k + 1);
    }
    previousCountRef.current = totalCount;
  }, [totalCount]);

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
  const taskPreviews = [...unseenTasks].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);
  const warningPreviews = [...unseenWarnings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 5);

  // Optimistically drop the item(s) from local state the instant it's
  // clicked — the badge shouldn't wait on a network round trip, and the
  // click also drives a <Link> navigation that must never be blocked by an
  // awaited mutation — then persist the read/seen state in the background
  // so it stays cleared on reload and for the sidebar dot in /chat, which
  // listens for this same row change. If the mutation itself fails, the
  // optimistic removal is reverted and surfaced as a toast instead of
  // silently leaving the client and database out of sync.
  function handleChatClick(senderId: string) {
    const removed = unreadChats.filter((m) => m.senderId === senderId);
    setUnreadChats((prev) => prev.filter((m) => m.senderId !== senderId));
    setOpen(false);
    createClient()
      .rpc('mark_conversation_read', { other_user_id: senderId })
      .then(({ error }) => {
        if (!error) return;
        console.error('mark_conversation_read failed', error);
        setUnreadChats((prev) => [...removed, ...prev]);
        toast.error(t('markReadFailed'));
      });
  }

  function handleIssueClick(issueId: string) {
    const removed = unseenIssues.find((i) => i.id === issueId);
    setUnseenIssues((prev) => prev.filter((i) => i.id !== issueId));
    setOpen(false);
    createClient()
      .rpc('mark_issue_seen', { issue_id: issueId })
      .then(({ error }) => {
        if (!error) return;
        console.error('mark_issue_seen failed', error);
        if (removed) setUnseenIssues((prev) => [removed, ...prev]);
        toast.error(t('markReadFailed'));
      });
  }

  // Tasks only expose a bulk "mark all seen" RPC (mirrors visiting /tasks
  // via MarkTasksSeen) — there's no per-task equivalent of mark_issue_seen,
  // so clicking any one task preview clears the whole task badge/list.
  function handleTaskClick() {
    const removed = unseenTasks;
    setUnseenTasks([]);
    setOpen(false);
    createClient()
      .rpc('mark_tasks_seen')
      .then(({ error }) => {
        if (!error) return;
        console.error('mark_tasks_seen failed', error);
        setUnseenTasks(removed);
        toast.error(t('markReadFailed'));
      });
  }

  // Warnings only expose a bulk "mark all seen" RPC (mirrors visiting one's
  // own profile via MarkWarningsSeen) — same reasoning as handleTaskClick.
  function handleWarningClick() {
    const removed = unseenWarnings;
    setUnseenWarnings([]);
    setOpen(false);
    createClient()
      .rpc('mark_warnings_seen')
      .then(({ error }) => {
        if (!error) return;
        console.error('mark_warnings_seen failed', error);
        setUnseenWarnings(removed);
        toast.error(t('markReadFailed'));
      });
  }

  // Failsafe: every time the dropdown opens, re-read the absolute truth
  // from the database and reconcile local state to match it. This is what
  // actually guarantees correctness regardless of any missed Realtime event
  // or a mutation that failed without the user noticing the toast.
  const resyncFromDatabase = useCallback(async () => {
    const supabase = createClient();
    const [{ data: chatRows }, { data: issueRows }, { data: taskRows }, { data: warningRows }] = await Promise.all([
      supabase
        .from('staff_chats')
        .select('id, sender_id, message_text, created_at')
        .eq('receiver_id', userId)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('issues')
        .select('id, title, created_at')
        .eq('assigned_to', userId)
        .eq('is_seen', false)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('tasks')
        .select('id, title, created_at')
        .eq('assigned_to', userId)
        .eq('is_seen', false)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('staff_warnings')
        .select('id, reason, created_at')
        .eq('staff_id', userId)
        .eq('is_seen', false)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (chatRows) {
      setUnreadChats(
        chatRows.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          messageText: m.message_text,
          createdAt: m.created_at,
        })),
      );
    }
    if (issueRows) {
      setUnseenIssues(issueRows.map((i) => ({ id: i.id, title: i.title, createdAt: i.created_at })));
    }
    if (taskRows) {
      setUnseenTasks(taskRows.map((task) => ({ id: task.id, title: task.title, createdAt: task.created_at })));
    }
    if (warningRows) {
      setUnseenWarnings(warningRows.map((w) => ({ id: w.id, reason: w.reason, createdAt: w.created_at })));
    }
  }, [userId]);

  useEffect(() => {
    if (open) resyncFromDatabase();
  }, [open, resyncFromDatabase]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        render={
          <button
            type="button"
            aria-label={t('title')}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/10 text-white transition-transform duration-200 ease-bounce hover:scale-110 hover:bg-white/20 active:scale-90"
          />
        }
      >
        <Bell key={shakeKey} className={cn('size-4.5', shakeKey > 0 && 'animate-shake')} />
        {totalCount > 0 && (
          <span
            key={totalCount}
            className="animate-pop-in absolute -top-1 -right-1 flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.85)]"
          >
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
                        onClick={() => handleChatClick(m.senderId)}
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
                      {t('issues')}
                    </p>
                    {issuePreviews.map((issue) => (
                      <Link
                        key={issue.id}
                        href="/issues"
                        onClick={() => handleIssueClick(issue.id)}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="truncate text-sm font-medium text-white">{issue.title}</span>
                        <span className="text-xs text-white/60">
                          {format.relativeTime(new Date(issue.createdAt), now)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {taskPreviews.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                      {t('tasks')}
                    </p>
                    {taskPreviews.map((task) => (
                      <Link
                        key={task.id}
                        href="/tasks"
                        onClick={handleTaskClick}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="truncate text-sm font-medium text-white">{task.title}</span>
                        <span className="text-xs text-white/60">
                          {format.relativeTime(new Date(task.createdAt), now)}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
                {warningPreviews.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                      {t('warnings')}
                    </p>
                    {warningPreviews.map((warning) => (
                      <Link
                        key={warning.id}
                        href={`/profile/${userId}`}
                        onClick={handleWarningClick}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="truncate text-sm font-medium text-white">{warning.reason}</span>
                        <span className="text-xs text-white/60">
                          {format.relativeTime(new Date(warning.createdAt), now)}
                        </span>
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
