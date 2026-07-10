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

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase.channel('presence:online', { config: { presence: { key: userId } } });

      channel
        .on('presence', { event: 'sync' }, () => {
          setOnlineUserIds(new Set(Object.keys(channel!.presenceState())));
        })
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await channel!.track({ online_at: new Date().toISOString() });
        });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return <PresenceContext.Provider value={onlineUserIds}>{children}</PresenceContext.Provider>;
}

export function useOnlineUserIds() {
  return useContext(PresenceContext);
}
