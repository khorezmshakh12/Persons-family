'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { getNavBadgesAction } from '@/lib/actions/nav-badges';
import type { NavItem } from '@/lib/nav';

const NavBadgesContext = createContext<NavItem['key'][]>([]);

/**
 * Keeps the sidebar's "new" dots (tasks/issues/companyNews/chat/profile —
 * profile's dot covers unseen warnings) live. The
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

  // `initialKeys` is a fresh array from the server on every render this
  // component's ancestors re-run for (navigation, or a `router.refresh()`
  // after marking something seen from the notification bell) — but a
  // lazy useState initializer only runs once, on mount. Without this,
  // clicking a bell item called router.refresh() correctly, the server
  // recomputed a clean `initialKeys`, and this component just never
  // noticed: the dot stayed lit even though the DB (and a hard reload)
  // both already agreed it should be gone.
  useEffect(() => {
    setKeys(new Set(initialKeys));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialKeys)]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Every write path that touches tasks/issues/staff_chats/staff_warnings
    // for this user bumps nav_badge_signals/{uid} (see
    // lib/gcp/firestoreAdmin.ts's bumpNavBadgeSignal) — this just re-derives
    // the true set of active dots from Cloud SQL whenever that fires, same
    // as the old per-table resync but collapsed into one server round trip
    // instead of five. company_news is broadcast to every active user
    // rather than a per-user write, so it bumps the shared
    // board_signals/company_news doc instead — everyone listens to that one
    // too, on top of their own uid doc.
    const refresh = async () => {
      const nextKeys = await getNavBadgesAction();
      if (!cancelled) setKeys(new Set(nextKeys));
    };

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const db = getRealtimeDb();
        const unsubUser = onSnapshot(doc(db, 'nav_badge_signals', userId), () => refresh());
        const unsubNews = onSnapshot(doc(db, 'board_signals', 'company_news'), () => refresh());
        unsubscribe = () => {
          unsubUser();
          unsubNews();
        };
      })
      .catch((error) => console.error('nav badges realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [userId]);

  return <NavBadgesContext.Provider value={Array.from(keys)}>{children}</NavBadgesContext.Provider>;
}

export function useNavBadgeKeys(): NavItem['key'][] {
  return useContext(NavBadgesContext);
}
