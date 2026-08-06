'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { NavItem } from '@/lib/nav';

const NavBadgesContext = createContext<NavItem['key'][]>([]);

type BadgeKey = Extract<NavItem['key'], 'tasks' | 'issues' | 'companyNews'>;

/**
 * Keeps the sidebar's "new" dots (tasks/issues/companyNews) live. The
 * (app) layout computes `initialKeys` once per navigation (it's the only
 * server-side signal Next.js gives us), which is why a task or issue
 * assigned to someone already sitting on the page used to only show up
 * after they refreshed or navigated — nothing was pushing the change to an
 * already-rendered client. This subscribes to the same tables the bell
 * does and re-derives each badge's true on/off state from the database
 * whenever a relevant row changes, so the dot appears the moment the row
 * lands instead of waiting for the next server render.
 */
export function NavBadgesProvider({
  userId,
  initialKeys,
  children,
}: {
  userId: string;
  initialKeys: NavItem['key'][];
  children: ReactNode;
}) {
  const [keys, setKeys] = useState<Set<NavItem['key']>>(() => new Set(initialKeys));

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const setBadge = (key: BadgeKey, active: boolean) => {
      setKeys((prev) => {
        if (prev.has(key) === active) return prev;
        const next = new Set(prev);
        if (active) next.add(key);
        else next.delete(key);
        return next;
      });
    };

    // Each handler re-derives the true count from the database rather than
    // trusting the realtime payload alone — a bulk "mark seen" can still
    // leave other unseen rows behind, so "this row turned seen" doesn't by
    // itself mean the badge should clear. Mirrors NotificationBell's own
    // resync-on-change pattern.
    const refreshTasks = async () => {
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', userId)
        .eq('is_seen', false);
      if (!cancelled) setBadge('tasks', (count ?? 0) > 0);
    };

    const refreshIssues = async () => {
      const { count } = await supabase
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', userId)
        .eq('is_seen', false);
      if (!cancelled) setBadge('issues', (count ?? 0) > 0);
    };

    const refreshCompanyNews = async () => {
      const { data } = await supabase.rpc('unseen_company_news_count');
      if (!cancelled) setBadge('companyNews', (data ?? 0) > 0);
    };

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('nav_badges')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
          refreshTasks,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${userId}` },
          refreshTasks,
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'issues', filter: `assigned_to=eq.${userId}` },
          refreshIssues,
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'issues', filter: `assigned_to=eq.${userId}` },
          refreshIssues,
        )
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'company_news' }, refreshCompanyNews)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'company_news_reads', filter: `user_id=eq.${userId}` },
          refreshCompanyNews,
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return <NavBadgesContext.Provider value={Array.from(keys)}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadgeKeys(): NavItem['key'][] {
  return useContext(NavBadgesContext);
}
