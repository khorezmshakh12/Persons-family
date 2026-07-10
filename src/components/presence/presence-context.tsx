'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

const PresenceContext = createContext<Set<string>>(new Set());

/** One shared Realtime Presence channel for the whole app — every signed-in
 * tab tracks its own user id, and every tab's context updates on each
 * join/leave. Only ever exposes "is this id currently online" from any
 * client component (staff table, chat sidebar, navbar), never anything
 * about WHAT another user is doing. */
export function PresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let cleanupListeners: (() => void) | undefined;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase.channel('presence:online', { config: { presence: { key: userId } } });

      const syncFromServer = () => setOnlineUserIds(new Set(Object.keys(channel!.presenceState())));

      channel
        // `sync` is the authoritative full snapshot and already reflects
        // every join/leave, but `join`/`leave` are also handled explicitly
        // so a single dropped `sync` frame can't leave a stale entry behind.
        .on('presence', { event: 'sync' }, syncFromServer)
        .on('presence', { event: 'join' }, syncFromServer)
        .on('presence', { event: 'leave' }, syncFromServer)
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel!.track({ online_at: new Date().toISOString() });
        });

      // A backgrounded tab (switched away, minimized, laptop lid closed)
      // keeps its WebSocket open, so the server has no signal to remove it
      // from presence until a much longer connection-timeout eventually
      // fires — which is exactly the "everyone still shows online" reports.
      // Untracking on hide and re-tracking on return closes that gap
      // immediately instead of waiting on the server-side timeout.
      const handleVisibilityChange = () => {
        if (!channel) return;
        if (document.visibilityState === 'hidden') {
          channel.untrack();
        } else {
          channel.track({ online_at: new Date().toISOString() });
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Best-effort: not guaranteed to complete on every browser/close path,
      // but it makes a clean tab close reflect instantly rather than
      // waiting on the connection to time out server-side.
      const handleBeforeUnload = () => {
        channel?.untrack();
      };
      window.addEventListener('beforeunload', handleBeforeUnload);

      cleanupListeners = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    })();

    return () => {
      cancelled = true;
      cleanupListeners?.();
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return <PresenceContext.Provider value={onlineUserIds}>{children}</PresenceContext.Provider>;
}

export function useOnlineUserIds() {
  return useContext(PresenceContext);
}
