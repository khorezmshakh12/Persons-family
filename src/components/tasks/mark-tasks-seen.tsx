'use client';

import { useEffect, useRef } from 'react';
import { markTasksSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markTasksSeenAction is scoped server-side to the caller's
// own uid, so calling it on every /tasks visit is safe even for a visitor
// with nothing assigned to them. Mirrors components/issues/mark-issues-seen.tsx
// exactly.
export function MarkTasksSeen() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    // Mount-only — see mark-company-news-seen.tsx: next-intl's useRouter()
    // returns a fresh ref each render, so `[router]` + router.refresh() here
    // is an infinite action/refresh loop.
    if (ran.current) return;
    ran.current = true;
    markTasksSeenAction()
      .then(() => {
        // Clears the sidebar's green dot immediately — the layout that
        // renders it is a cached Server Component, so without this it
        // would only pick up the now-seen state on the next full
        // navigation/reload.
        router.refresh();
      })
      .catch((error) => console.error('markTasksSeenAction failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
