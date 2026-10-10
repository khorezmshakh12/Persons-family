'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
  CheckCheck,
  Compass,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessageCircle,
  Settings2,
  Star,
  Target,
  Volume2,
  VolumeX,
  Wallet,
} from 'lucide-react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Link } from '@/i18n/navigation';
import { getNotificationBellDataAction, markNotificationsReadAction } from '@/lib/actions/notification-bell';
import {
  markConversationReadAction,
  markTasksSeenAction,
  markWarningsSeenAction,
  markLessonPlanAlertsSeenAction,
} from '@/lib/actions/notifications';
import type { FeedItem } from '@/lib/notifications';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { useNotificationChime } from './use-notification-chime';
import { emitLiveEvent, type LiveEventKind } from '@/components/motion/events';

export type { FeedItem };

export type UnreadChatItem = {
  id: string;
  senderId: string;
  messageText: string | null;
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

/* Bildirishnomalar markazi (v8-A, 2026-10-10). One list, three views:
 * "Harakat kerak" (things waiting on me — approve, confirm, a new task),
 * "O‘qilmagan" and "Hammasi". Stored notifications (the `notifications`
 * table — every kinded Telegram send and every notifyUsers call lands there)
 * merge with the four live sources that keep their own read state: unread
 * DMs, unseen tasks, unseen warnings and the lesson-plan report. */

type Row = {
  key: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  at: string;
  unread: boolean;
  action: boolean;
  open: () => void;
};

const KIND_ICON: Record<string, ComponentType<{ className?: string }>> = {
  chat: MessageCircle,
  task: ListChecks,
  issue: LifeBuoy,
  news: Megaphone,
  kpi: Target,
  pay: Wallet,
  stars: Star,
  lesson: BookOpen,
  report: BarChart3,
  perforce: Compass,
  warning: AlertTriangle,
};
const KIND_TINT: Record<string, string> = {
  chat: 'bg-au-info-soft text-au-info',
  task: 'bg-au-accent-soft text-au-accent-text',
  issue: 'bg-au-bad-soft text-au-bad',
  warning: 'bg-au-bad-soft text-au-bad',
  pay: 'bg-au-ok-soft text-au-ok',
  stars: 'bg-au-accent-soft text-au-accent-text',
  kpi: 'bg-au-info-soft text-au-info',
};
const LIVE_KIND: Record<string, LiveEventKind> = { chat: 'chat', task: 'task', issue: 'issue', warning: 'warning', lesson: 'lessonPlan' };

type View = 'action' | 'unread' | 'all';
const VIEWS: { v: View; n: string }[] = [
  { v: 'action', n: 'Harakat kerak' },
  { v: 'unread', n: 'O‘qilmagan' },
  { v: 'all', n: 'Hammasi' },
];

export function NotificationBell({
  userId,
  initialUnreadChats,
  initialFeed,
  initialUnseenTasks,
  initialUnseenWarnings,
  initialUnseenLessonPlanAlerts,
  profileNames,
}: {
  userId: string;
  initialUnreadChats: UnreadChatItem[];
  initialFeed: FeedItem[];
  initialUnseenTasks: UnseenTaskItem[];
  initialUnseenWarnings: UnseenWarningItem[];
  initialUnseenLessonPlanAlerts: UnseenLessonPlanAlertItem[];
  profileNames: Record<string, string>;
}) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [unreadChats, setUnreadChats] = useState(initialUnreadChats);
  const [feed, setFeed] = useState(initialFeed);
  const [unseenTasks, setUnseenTasks] = useState(initialUnseenTasks);
  const [unseenWarnings, setUnseenWarnings] = useState(initialUnseenWarnings);
  const [unseenLessonPlanAlerts, setUnseenLessonPlanAlerts] = useState(initialUnseenLessonPlanAlerts);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('unread');

  // Re-derive everything from Cloud SQL whenever this person's
  // nav_badge_signals doc (bumped by every notification write) or the shared
  // lesson-plan signal changes, and on every open.
  const resync = useCallback(async () => {
    const data = await getNotificationBellDataAction();
    setUnreadChats(data.unreadChats);
    setFeed(data.feed);
    setUnseenTasks(data.unseenTasks);
    setUnseenWarnings(data.unseenWarnings);
    setUnseenLessonPlanAlerts(data.unseenLessonPlanAlerts);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    // Dynamically imported so the Firestore SDK stays out of the first bundle.
    Promise.all([import('firebase/firestore'), import('@/lib/firebase/client')])
      .then(async ([{ doc, onSnapshot }, { ensureRealtimeSignedIn, getRealtimeDb }]) => {
        await ensureRealtimeSignedIn();
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

  // Optimistic removal + background persist; a failed write puts it back.
  // No router.refresh() here — it raced the <Link> navigation (see git
  // history of this file); each destination page clears its own dots.
  const fail = useCallback(
    (undo: () => void) => (error: unknown) => {
      console.error('notification mark failed', error);
      undo();
      toast.error(t('markReadFailed'));
    },
    [t],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const lastBySender = new Map<string, UnreadChatItem>();
    for (const m of unreadChats) {
      const e = lastBySender.get(m.senderId);
      if (!e || e.createdAt < m.createdAt) lastBySender.set(m.senderId, m);
    }
    for (const m of lastBySender.values()) {
      const count = unreadChats.filter((c) => c.senderId === m.senderId).length;
      out.push({
        key: `chat:${m.senderId}`,
        kind: 'chat',
        title: profileNames[m.senderId] ?? t('unknownSender'),
        body: `${count > 1 ? `${count} ta xabar · ` : ''}${m.messageText ?? t('mediaMessage')}`,
        href: `/chat?with=${m.senderId}`,
        at: m.createdAt,
        unread: true,
        action: false,
        open: () => {
          const removed = unreadChats.filter((c) => c.senderId === m.senderId);
          setUnreadChats((prev) => prev.filter((c) => c.senderId !== m.senderId));
          markConversationReadAction(m.senderId).catch(fail(() => setUnreadChats((prev) => [...removed, ...prev])));
        },
      });
    }
    const clearTasks = () => {
      const removed = unseenTasks;
      setUnseenTasks([]);
      markTasksSeenAction().catch(fail(() => setUnseenTasks(removed)));
    };
    for (const x of unseenTasks)
      out.push({ key: `task:${x.id}`, kind: 'task', title: 'Yangi vazifa', body: x.title, href: '/tasks', at: x.createdAt, unread: true, action: true, open: clearTasks });
    const clearWarnings = () => {
      const removed = unseenWarnings;
      setUnseenWarnings([]);
      markWarningsSeenAction().catch(fail(() => setUnseenWarnings(removed)));
    };
    for (const x of unseenWarnings)
      out.push({
        key: `warn:${x.id}`,
        kind: 'warning',
        title: 'Sizga ogohlantirish berildi',
        body: x.reason,
        href: `/profile/${userId}`,
        at: x.createdAt,
        unread: true,
        action: false,
        open: clearWarnings,
      });
    const clearLesson = () => {
      const removed = unseenLessonPlanAlerts;
      setUnseenLessonPlanAlerts([]);
      markLessonPlanAlertsSeenAction().catch(fail(() => setUnseenLessonPlanAlerts(removed)));
    };
    for (const x of unseenLessonPlanAlerts)
      out.push({ key: `lp:${x.id}`, kind: 'lesson', title: t('lessonPlanAlerts'), body: x.summary, href: '/lesson-plans', at: x.createdAt, unread: true, action: false, open: clearLesson });
    for (const n of feed)
      out.push({
        key: `n:${n.id}`,
        kind: n.kind,
        title: n.title,
        body: n.body,
        href: n.href,
        at: n.createdAt,
        unread: n.unread,
        action: n.action,
        open: () => {
          if (!n.unread) return;
          setFeed((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
          markNotificationsReadAction([n.id]).catch(fail(() => setFeed((prev) => prev.map((x) => (x.id === n.id ? { ...x, unread: true } : x)))));
        },
      });
    return out.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [unreadChats, unseenTasks, unseenWarnings, unseenLessonPlanAlerts, feed, profileNames, userId, t, fail]);

  const unreadCount = rows.filter((r) => r.unread).length;
  const actionCount = rows.filter((r) => r.action).length;
  const shown = rows.filter((r) => (view === 'action' ? r.action : view === 'unread' ? r.unread : true)).slice(0, 80);

  // Open on "Harakat kerak" when something waits on me, else "O‘qilmagan".
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setView(actionCount ? 'action' : 'unread');
      resync();
    }
  }

  function markAll() {
    const before = { feed, unseenTasks, unseenWarnings, unseenLessonPlanAlerts };
    setFeed((prev) => prev.map((x) => ({ ...x, unread: false })));
    setUnseenTasks([]);
    setUnseenWarnings([]);
    setUnseenLessonPlanAlerts([]);
    Promise.all([
      markNotificationsReadAction('all'),
      before.unseenTasks.length ? markTasksSeenAction() : null,
      before.unseenWarnings.length ? markWarningsSeenAction() : null,
      before.unseenLessonPlanAlerts.length ? markLessonPlanAlertsSeenAction() : null,
    ]).catch(
      fail(() => {
        setFeed(before.feed);
        setUnseenTasks(before.unseenTasks);
        setUnseenWarnings(before.unseenWarnings);
        setUnseenLessonPlanAlerts(before.unseenLessonPlanAlerts);
      }),
    );
  }

  // Shake + chime when the unread count grows (never on mount or on drops).
  const previousCountRef = useRef<number | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const { play, muted, toggleMuted } = useNotificationChime();
  useEffect(() => {
    if (previousCountRef.current !== null && unreadCount > previousCountRef.current) {
      setShakeKey((k) => k + 1);
      play();
    }
    previousCountRef.current = unreadCount;
  }, [unreadCount, play]);

  // MOTION v3 "Dynamic Island": announce the newest arrival (same guard).
  const liveCountRef = useRef<number | null>(null);
  useEffect(() => {
    const previous = liveCountRef.current;
    liveCountRef.current = unreadCount;
    if (previous === null || unreadCount <= previous) return;
    const newest = rows.find((r) => r.unread);
    if (newest) emitLiveEvent({ kind: LIVE_KIND[newest.kind] ?? 'info', text: [newest.title, newest.body].filter(Boolean).join(': '), href: newest.href ?? undefined });
  }, [unreadCount, rows]);

  return (
    <div className="flex items-center">
      <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <PopoverPrimitive.Trigger
          render={
            <button
              type="button"
              aria-label={unreadCount ? `${t('title')}: ${unreadCount}` : t('title')}
              className="relative grid size-[38px] shrink-0 place-items-center rounded-au-ctl border border-au-line bg-au-card text-au-muted transition-colors duration-150 hover:text-au-ink"
            />
          }
        >
          <Bell key={shakeKey} strokeWidth={1.75} className={cn('size-[17px]', shakeKey > 0 && 'animate-shake')} />
          {unreadCount > 0 && (
            <span
              key={unreadCount}
              className={cn(
                'animate-pop-in pointer-events-none absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-au-bg tabular-nums',
                actionCount ? 'bg-au-bad' : 'bg-au-info',
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner align="end" sideOffset={10} className="z-50 outline-none">
            <PopoverPrimitive.Popup className={cn(GLASS_CARD, 'flex w-[380px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0')}>
              <div className="flex items-center justify-between gap-2 border-b border-au-line px-4 py-3">
                <h3 className="text-sm font-bold text-au-ink">
                  {t('title')}
                  {unreadCount > 0 && <span className="ml-1.5 text-au-muted tabular-nums">{unreadCount}</span>}
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={markAll}
                    disabled={!unreadCount}
                    className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-au-muted hover:bg-au-card-2 hover:text-au-ink disabled:opacity-40"
                  >
                    <CheckCheck className="size-3.5" /> Hammasi o‘qildi
                  </button>
                  <button
                    type="button"
                    onClick={toggleMuted}
                    aria-pressed={muted}
                    aria-label={muted ? t('unmuteSound') : t('muteSound')}
                    title={muted ? t('unmuteSound') : t('muteSound')}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                  >
                    {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                </div>
              </div>

              <div role="tablist" className="flex gap-1 border-b border-au-line px-3 py-2">
                {VIEWS.map(({ v, n }) => {
                  const c = v === 'action' ? actionCount : v === 'unread' ? unreadCount : 0;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors',
                        view === v ? 'bg-au-primary text-white' : 'text-au-muted hover:bg-au-card-2 hover:text-au-ink',
                      )}
                    >
                      {n}
                      {c > 0 && (
                        <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', view === v ? 'bg-white/20' : v === 'action' ? 'bg-au-bad-soft text-au-bad' : 'bg-au-card-2')}>
                          {c}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[min(28rem,65vh)] overflow-y-auto overscroll-contain p-1.5">
                {shown.length === 0 ? (
                  <p className="px-3 py-10 text-center text-sm text-au-muted">
                    {view === 'action' ? 'Sizdan hech narsa kutilmayapti 🎉' : view === 'unread' ? 'Hammasi o‘qilgan.' : t('empty')}
                  </p>
                ) : (
                  shown.map((r) => {
                    const Icon = KIND_ICON[r.kind] ?? Bell;
                    const inner = (
                      <>
                        <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg', KIND_TINT[r.kind] ?? 'bg-au-card-2 text-au-muted')}>
                          <Icon className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn('line-clamp-2 text-[13px] leading-snug', r.unread ? 'font-semibold text-au-ink' : 'font-medium text-au-muted')}>{r.title}</span>
                          {r.body && <span className="line-clamp-2 text-xs leading-snug whitespace-pre-line text-au-muted">{r.body}</span>}
                          <span className="flex items-center gap-1.5 text-[11px] text-au-faint">
                            {format.relativeTime(new Date(r.at), now)}
                            {r.action && <span className="rounded bg-au-bad-soft px-1 font-semibold text-au-bad">Harakat kerak</span>}
                          </span>
                        </span>
                        {r.unread && <span aria-label="o‘qilmagan" className="mt-2 size-2 shrink-0 rounded-full bg-au-info" />}
                      </>
                    );
                    const cls = cn('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-au-card-2', r.unread && 'bg-au-card-2/50');
                    return r.href ? (
                      <Link
                        key={r.key}
                        href={r.href}
                        onClick={() => {
                          r.open();
                          setOpen(false);
                        }}
                        className={cls}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <button key={r.key} type="button" onClick={r.open} className={cls}>
                        {inner}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between border-t border-au-line bg-au-card-2 px-4 py-2 text-[11px] text-au-muted">
                <span>90 kun saqlanadi</span>
                <Link href="/settings?s=notifications" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 font-semibold hover:text-au-ink">
                  <Settings2 className="size-3.5" /> Telegram sozlamalari
                </Link>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  );
}
