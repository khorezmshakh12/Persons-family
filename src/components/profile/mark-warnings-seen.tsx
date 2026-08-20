'use client';

import { useEffect } from 'react';
import { markWarningsSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markWarningsSeenAction is scoped server-side to the
// caller's own uid, so calling it on every own-profile visit is safe.
// Mirrors components/tasks/mark-tasks-seen.tsx exactly.
export function MarkWarningsSeen() {
  const router = useRouter();

  useEffect(() => {
    markWarningsSeenAction()
      .then(() => {
        // Clears the sidebar's green dot immediately — the layout that
        // renders it is a cached Server Component, so without this it
        // would only pick up the now-seen state on the next full
        // navigation/reload.
        router.refresh();
      })
      .catch((error) => console.error('markWarningsSeenAction failed', error));
  }, [router]);

  return null;
}
