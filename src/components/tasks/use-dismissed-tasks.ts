'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'tasks:dismissed';

/**
 * Per-viewer "minimised card" state for the tasks board.
 *
 * Storage is best-effort by design: every read and write is wrapped, because
 * `localStorage` is not merely empty but *throws on access* in a private
 * window, with site data blocked, or inside an embedded preview. The hook
 * therefore always renders correctly with nothing stored — a failed write
 * only means the collapse doesn't survive a reload.
 *
 * Nothing here talks to the server: dismissing a card is a private viewing
 * preference, not task state, so there is no Server Action (and so no effect
 * that could re-arm itself — see AGENTS.md's render-loop guardrail).
 */
export function useDismissedTasks() {
  // Both the server render and the first client render start empty; reading
  // storage during render would crash SSR outright and hydrate mismatched.
  // The mount-only effect below is what fills it in.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set<string>());
  // Mirror of the same set, so the callbacks below can compute the next
  // value (and persist it) without a side effect inside a state updater —
  // updaters must stay pure, StrictMode invokes them twice.
  const dismissedRef = useRef<Set<string>>(new Set<string>());

  useEffect(() => {
    let stored: string[] = [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) stored = parsed.filter((id): id is string => typeof id === 'string');
    } catch {
      // Unreadable/blocked/corrupt — fall through with an empty set.
    }
    if (stored.length === 0) return;
    dismissedRef.current = new Set(stored);
    setDismissed(dismissedRef.current);
  }, []);

  const commit = useCallback((next: Set<string>) => {
    dismissedRef.current = next;
    setDismissed(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Quota / blocked site data: the card still collapses for this
      // session, it just won't be remembered.
    }
  }, []);

  const toggleDismissed = useCallback(
    (id: string) => {
      const next = new Set(dismissedRef.current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      commit(next);
    },
    [commit],
  );

  /** Drops stored flags for the given ids. Returns without touching state
   * when none of them are set, which is what keeps the board's "reset a
   * completed task" effect from re-triggering itself. */
  const clearDismissed = useCallback(
    (ids: readonly string[]) => {
      if (!ids.some((id) => dismissedRef.current.has(id))) return;
      const next = new Set(dismissedRef.current);
      for (const id of ids) next.delete(id);
      commit(next);
    },
    [commit],
  );

  return { dismissed, toggleDismissed, clearDismissed };
}
