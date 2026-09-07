'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Bell } from 'lucide-react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { doc, onSnapshot } from 'firebase/firestore';
import { Link } from '@/i18n/navigation';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { getNotificationBellDataAction } from '@/lib/actions/notification-bell';
import {
  markConversationReadAction,
  markIssueSeenAction,
  markTasksSeenAction,
  markWarningsSeenAction,
  markLessonPlanAlertsSeenAction,
} from '@/lib/actions/notifications';
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

export type UnseenLessonPlanAlertItem = {
  id: string;
  summary: string;
  createdAt: string;
};

export function NotificationBell({
  userId,
  initialUnreadChats,
  initialUnseenIssues,
  initialUnseenTasks,
  initialUnseenWarnings,
  initialUnseenLessonPlanAlerts,
  profileNames,
}: {
  userId: string;
  initialUnreadChats: UnreadChatItem[];
  initialUnseenIssues: UnseenIssueItem[];
  initialUnseenTasks: UnseenTaskItem[];
  initialUnseenWarnings: UnseenWarningItem[];
  initialUnseenLessonPlanAlerts: UnseenLessonPlanAlertItem[];
  profileNames: Record<string, string>;
}) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [unreadChats, setUnreadChats] = useState(initialUnreadChats);
  const [unseenIssues, setUnseenIssues] = useState(initialUnseenIssues);
  const [unseenTasks, setUnseenTasks] = useState(initialUnseenTasks);
  const [unseenWarnings, setUnseenWarnings] = useState(initialUnseenWarnings);
  const [unseenLessonPlanAlerts, setUnseenLessonPlanAlerts] = useState(initialUnseenLessonPlanAlerts);
  const [open, setOpen] = useState(false);

  // Realtime keeps the bell live without a refetch: a Firestore signal doc
  // changing (see lib/gcp/firestoreAdmin.ts's bumpNavBadgeSignal, called by
  // every Server Action that touches staff_chats/issues/tasks/
  // staff_warnings for this user) triggers a full resync from Cloud SQL —
  // same "always re-derive the true set" reasoning as NavBadgesProvider,
  // just returning the full item list here instead of a boolean.
  // lesson_plan_compliance_alerts is a CEO-only broadcast (no per-user
  // column), so it listens to the shared board_signals/lesson_plan_alerts
  // doc instead of its own uid doc.
  const resync = useCallback(async () => {
    const data = await getNotificationBellDataAction();
    setUnreadChats(data.unreadChats);
    setUnseenIssues(data.unseenIssues);
    setUnseenTasks(data.unseenTasks);
    setUnseenWarnings(data.unseenWarnings);
    setUnseenLessonPlanAlerts(data.unseenLessonPlanAlerts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const db = getRealtimeDb();
        const unsubBadge = onSnapshot(doc(db, 'nav_badge_signals', userId), () => resync());
        const unsubLessonPlan = onSnapshot(doc(db, 'board_signals', 'lesson_plan_alerts'), () => resync());
        unsubscribe = () => {
          unsubBadge();
          unsubLessonPlan();
        };
      })
      .catch((error) => console.error('notification bell realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId, resync]);

  const totalCount =
    unreadChats.length + unseenIssues.length + unseenTasks.length + unseenWarnings.length + unseenLessonPlanAlerts.length;

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
  const lessonPlanAlertPreviews = [...unseenLessonPlanAlerts]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  // Optimistically drop the item(s) from local state the instant it's
  // clicked — the badge shouldn't wait on a network round trip, and the
  // click also drives a <Link> navigation that must never be blocked by an
  // awaited mutation — then persist the read/seen state in the background
  // so it stays cleared on reload and for the sidebar dot in /chat, which
  // listens for this same row change. If the mutation itself fails, the
  // optimistic removal is reverted and surfaced as a toast instead of
  // silently leaving the client and database out of sync.
  //
  // Deliberately NO router.refresh() chained onto these mutations — that is
  // what used to stop a notification from opening at all. Since the Cloud
  // SQL migration these mark-seen calls are Server Actions, so each one is
  // dispatched into Next's router action queue the moment it's called and
  // becomes the queue's pending action. The <Link>'s own ACTION_NAVIGATE
  // fires immediately after this handler returns (next/link runs the
  // caller's onClick first, then navigates), which discards that pending
  // server action and takes over the slot. When the discarded action's
  // response finally lands, the queue clears its pending slot even though
  // the navigation is still in flight — so a router.refresh() in the
  // mutation's .then() found an "idle" queue and ran straight away against
  // the *pre-click* router state. Resolving after the navigation, it then
  // overwrote it: the dropdown closed, the row was correctly marked seen,
  // and the user was left sitting on the page they clicked from.
  //
  // Nothing is lost by dropping it. Every destination refreshes the sidebar
  // dots itself once it has actually mounted — MarkTasksSeen (/tasks),
  // MarkIssuesSeen (/issues), MarkWarningsSeen (own /profile/<id>) and
  // chat-hub-client's own markConversationReadAction all do mark-seen +
  // router.refresh() *after* the navigation has committed, so there is
  // nothing left to race — and every mark-seen query also bumps
  // nav_badge_signals/{uid} (see lib/db/queries/mark-seen.ts), which
  // NavBadgesProvider listens to and re-derives from. ('lessonPlans' isn't
  // a sidebar badge key at all — see computeNavBadgeKeys — so that one's
  // refresh never cleared anything in the first place.)
  function handleChatClick(senderId: string) {
    const removed = unreadChats.filter((m) => m.senderId === senderId);
    setUnreadChats((prev) => prev.filter((m) => m.senderId !== senderId));
    setOpen(false);
    markConversationReadAction(senderId).catch((error) => {
      console.error('markConversationReadAction failed', error);
      setUnreadChats((prev) => [...removed, ...prev]);
      toast.error(t('markReadFailed'));
    });
  }

  function handleIssueClick(issueId: string) {
    const removed = unseenIssues.find((i) => i.id === issueId);
    setUnseenIssues((prev) => prev.filter((i) => i.id !== issueId));
    setOpen(false);
    markIssueSeenAction(issueId).catch((error) => {
      console.error('markIssueSeenAction failed', error);
      if (removed) setUnseenIssues((prev) => [removed, ...prev]);
      toast.error(t('markReadFailed'));
    });
  }

  // Tasks only expose a bulk "mark all seen" action (mirrors visiting
  // /tasks via MarkTasksSeen) — there's no per-task equivalent of
  // markIssueSeenAction, so clicking any one task preview clears the whole
  // task badge/list.
  function handleTaskClick() {
    const removed = unseenTasks;
    setUnseenTasks([]);
    setOpen(false);
    markTasksSeenAction().catch((error) => {
      console.error('markTasksSeenAction failed', error);
      setUnseenTasks(removed);
      toast.error(t('markReadFailed'));
    });
  }

  // Warnings only expose a bulk "mark all seen" action (mirrors visiting
  // one's own profile via MarkWarningsSeen) — same reasoning as
  // handleTaskClick.
  function handleWarningClick() {
    const removed = unseenWarnings;
    setUnseenWarnings([]);
    setOpen(false);
    markWarningsSeenAction().catch((error) => {
      console.error('markWarningsSeenAction failed', error);
      setUnseenWarnings(removed);
      toast.error(t('markReadFailed'));
    });
  }

  // Bulk mark-seen, same reasoning as handleTaskClick/handleWarningClick —
  // there's no per-alert equivalent, and clicking any one preview clears
  // the whole section. Unlike tasks/issues/warnings, /lesson-plans has no
  // mark-seen component of its own, so this is the only thing that clears
  // these alerts.
  function handleLessonPlanAlertClick() {
    const removed = unseenLessonPlanAlerts;
    setUnseenLessonPlanAlerts([]);
    setOpen(false);
    markLessonPlanAlertsSeenAction().catch((error) => {
      console.error('markLessonPlanAlertsSeenAction failed', error);
      setUnseenLessonPlanAlerts(removed);
      toast.error(t('markReadFailed'));
    });
  }

  // Failsafe: every time the dropdown opens, re-read the absolute truth
  // from the database and reconcile local state to match it. This is what
  // actually guarantees correctness regardless of any missed Firestore
  // signal or a mutation that failed without the user noticing the toast.
  useEffect(() => {
    if (open) resync();
  }, [open, resync]);

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
                        href={`/chat?with=${m.senderId}`}
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
                {lessonPlanAlertPreviews.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <p className="px-2 text-[11px] font-semibold tracking-wide text-white/40 uppercase">
                      {t('lessonPlanAlerts')}
                    </p>
                    {lessonPlanAlertPreviews.map((alert) => (
                      <Link
                        key={alert.id}
                        href="/lesson-plans"
                        onClick={handleLessonPlanAlertClick}
                        className="flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-white/10"
                      >
                        <span className="whitespace-pre-line text-sm font-medium text-white">{alert.summary}</span>
                        <span className="text-xs text-white/60">
                          {format.relativeTime(new Date(alert.createdAt), now)}
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
