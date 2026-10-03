'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Timestamp } from 'firebase/firestore';

const PresenceContext = createContext<Set<string>>(new Set());
/** People currently typing to *me* (presence doc typingTo === me, fresh). */
const TypingContext = createContext<Set<string>>(new Set());

const TYPING_FRESH_MS = 6_000;
const TYPING_THROTTLE_MS = 2_500;
let sendTyping: ((to: string | null) => void) | undefined;
let lastTypingSent = 0;
let lastTypingTo: string | null = null;

/** Tell `to` that I'm typing (null = stopped). Throttled; a no-op until the
 * presence connection is up. Rides on my own presence doc, which I already
 * write every 20 s, so it needs no new Firestore permission. */
export function signalTyping(to: string | null) {
  const now = Date.now();
  if (to && to === lastTypingTo && now - lastTypingSent < TYPING_THROTTLE_MS) return;
  if (!to && !lastTypingTo) return;
  lastTypingSent = now;
  lastTypingTo = to;
  sendTyping?.(to);
}

// A doc's lastSeenAt older than this is treated as offline — there's no
// onDisconnect() here (that needs Realtime Database, not Firestore; see
// lib/gcp/firestoreAdmin.ts's module comment for why this app uses a
// heartbeat instead), so a closed tab is only ever detected by its
// heartbeat going stale, never by an immediate server-side signal.
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_AFTER_MS = 30_000;

type PresenceDoc = {
  state: 'online' | 'offline';
  lastSeenAt: Timestamp | null;
  typingTo?: string | null;
  typingAt?: Timestamp | null;
};

/** One shared Firestore presence collection for the whole app — every
 * signed-in tab writes its own heartbeat doc, and every tab's context
 * recomputes the online set from the whole collection's snapshot. Only
 * ever exposes "is this id currently online" from any client component
 * (staff table, chat sidebar, navbar), never anything about WHAT another
 * user is doing. */
export function PresenceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    let staleCheckInterval: ReturnType<typeof setInterval> | undefined;
    // Assigned once the dynamically-imported SDK resolves (below) — kept in
    // the outer scope so the unmount cleanup can still send the final
    // "offline" write.
    let writeHeartbeat: ((state: 'online' | 'offline') => void) | undefined;
    const latestDocs: Map<string, PresenceDoc> = new Map();

    const recomputeOnline = () => {
      const now = Date.now();
      const next = new Set<string>();
      for (const [uid, data] of latestDocs) {
        const lastSeenMs = data.lastSeenAt?.toMillis() ?? 0;
        if (data.state === 'online' && now - lastSeenMs < STALE_AFTER_MS) next.add(uid);
      }
      setOnlineUserIds(next);
    };

    let typingTimer: ReturnType<typeof setInterval> | undefined;
    const recomputeTyping = () => {
      const now = Date.now();
      const next = new Set<string>();
      for (const [uid, data] of latestDocs) {
        const at = data.typingAt?.toMillis?.() ?? 0;
        if (uid !== userId && data.typingTo === userId && now - at < TYPING_FRESH_MS) next.add(uid);
      }
      setTypingUserIds((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next));
      // Only tick while someone is typing, so idle tabs stay quiet.
      if (next.size && !typingTimer) typingTimer = setInterval(recomputeTyping, 1000);
      if (!next.size && typingTimer) {
        clearInterval(typingTimer);
        typingTimer = undefined;
      }
    };

    // Firebase (client SDK) is dynamically imported here rather than at
    // module scope: this provider wraps every authenticated page (see
    // app-shell.tsx), so a static import put the whole Firestore/Auth SDK
    // in the bundle every page has to parse before it can hydrate. Presence
    // is a live enhancement, not something the first paint depends on, so
    // deferring its chunk to right after mount costs nothing visible.
    Promise.all([import('firebase/firestore'), import('@/lib/firebase/client')])
      .then(async ([{ collection, doc, onSnapshot, serverTimestamp, setDoc }, { ensureRealtimeSignedIn, getRealtimeDb }]) => {
        // `heartbeat` is a locally-narrowed alias: `writeHeartbeat` itself
        // is typed `| undefined` (the unmount cleanup below can run before
        // this promise ever resolves), so TS can't carry that narrowing
        // into the closures captured below (the interval and the two event
        // listeners) — this const can only ever be the function.
        const heartbeat = (state: 'online' | 'offline') => {
          setDoc(doc(getRealtimeDb(), 'presence', userId), { state, lastSeenAt: serverTimestamp() }, { merge: true }).catch(
            (error) => console.error('presence heartbeat failed', error),
          );
        };
        writeHeartbeat = heartbeat;
        sendTyping = (to) => {
          setDoc(doc(getRealtimeDb(), 'presence', userId), { typingTo: to, typingAt: serverTimestamp() }, { merge: true }).catch(
            () => {},
          );
        };

        await ensureRealtimeSignedIn();
        if (cancelled) return;
        const db = getRealtimeDb();

        unsubscribe = onSnapshot(collection(db, 'presence'), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'removed') latestDocs.delete(change.doc.id);
            else latestDocs.set(change.doc.id, change.doc.data() as PresenceDoc);
          });
          recomputeOnline();
          recomputeTyping();
        });

        heartbeat('online');
        heartbeatInterval = setInterval(() => heartbeat('online'), HEARTBEAT_INTERVAL_MS);
        // Re-check staleness on a timer too — a user going stale doesn't by
        // itself produce a new snapshot event for anyone else to react to.
        staleCheckInterval = setInterval(recomputeOnline, 10_000);

        const handleVisibilityChange = () => {
          heartbeat(document.visibilityState === 'hidden' ? 'offline' : 'online');
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const handleBeforeUnload = () => heartbeat('offline');
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
      if (typingTimer) clearInterval(typingTimer);
      sendTyping = undefined;
      writeHeartbeat?.('offline');
    };
  }, [userId]);

  return (
    <PresenceContext.Provider value={onlineUserIds}>
      <TypingContext.Provider value={typingUserIds}>{children}</TypingContext.Provider>
    </PresenceContext.Provider>
  );
}

export function useOnlineUserIds() {
  return useContext(PresenceContext);
}

export function useTypingUserIds() {
  return useContext(TypingContext);
}
