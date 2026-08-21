'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';

const PresenceContext = createContext<Set<string>>(new Set());

// A doc's lastSeenAt older than this is treated as offline — there's no
// onDisconnect() here (that needs Realtime Database, not Firestore; see
// lib/gcp/firestoreAdmin.ts's module comment for why this app uses a
// heartbeat instead), so a closed tab is only ever detected by its
// heartbeat going stale, never by an immediate server-side signal.
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 30_000;

type PresenceDoc = { state: 'online' | 'offline'; lastSeenAt: Timestamp | null };

/** One shared Firestore presence collection for the whole app — every
 * signed-in tab writes its own heartbeat doc, and every tab's context
 * recomputes the online set from the whole collection's snapshot. Only
 * ever exposes "is this id currently online" from any client component
 * (staff table, chat sidebar, navbar), never anything about WHAT another
 * user is doing. */
export function PresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    let staleCheckInterval: ReturnType<typeof setInterval> | undefined;
    let latestDocs: Map<string, PresenceDoc> = new Map();

    const recomputeOnline = () => {
      const now = Date.now();
      const next = new Set<string>();
      for (const [uid, data] of latestDocs) {
        const lastSeenMs = data.lastSeenAt?.toMillis() ?? 0;
        if (data.state === 'online' && now - lastSeenMs < STALE_AFTER_MS) next.add(uid);
      }
      setOnlineUserIds(next);
    };

    const writeHeartbeat = (state: 'online' | 'offline') => {
      setDoc(doc(getRealtimeDb(), 'presence', userId), { state, lastSeenAt: serverTimestamp() }, { merge: true }).catch(
        (error) => console.error('presence heartbeat failed', error),
      );
    };

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        const db = getRealtimeDb();

        unsubscribe = onSnapshot(collection(db, 'presence'), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') latestDocs.delete(change.doc.id);
            else latestDocs.set(change.doc.id, change.doc.data() as PresenceDoc);
          });
          recomputeOnline();
        });

        writeHeartbeat('online');
        heartbeatInterval = setInterval(() => writeHeartbeat('online'), HEARTBEAT_INTERVAL_MS);
        // Re-check staleness on a timer too — a user going stale doesn't by
        // itself produce a new snapshot event for anyone else to react to.
        staleCheckInterval = setInterval(recomputeOnline, 10_000);

        const handleVisibilityChange = () => {
          writeHeartbeat(document.visibilityState === 'hidden' ? 'offline' : 'online');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const handleBeforeUnload = () => writeHeartbeat('offline');
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };
      })
      .catch((error) => console.error('presence realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      if (staleCheckInterval) clearInterval(staleCheckInterval);
      writeHeartbeat('offline');
    };
  }, [userId]);

  return <PresenceContext.Provider value={onlineUserIds}>{children}</PresenceContext.Provider>;
}

export function useOnlineUserIds() {
  return useContext(PresenceContext);
}
