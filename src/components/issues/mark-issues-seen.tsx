'use client';

import { useEffect, useRef } from 'react';
import { markIssuesSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markIssuesSeenAction is scoped server-side to the
// caller's own uid, so calling it on every /issues visit is safe even
// though most visitors have nothing assigned to them.
export function MarkIssuesSeen() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    // Mount-only — see mark-company-news-seen.tsx: next-intl's useRouter()
    // returns a fresh ref each render, so `[router]` + router.refresh() here
    // is an infinite action/refresh loop.
    if (ran.current) return;
    ran.current = true;
    markIssuesSeenAction()
      .then(() => router.refresh()) // Clears the sidebar's green dot immediately — see mark-tasks-seen.tsx.
      .catch((error) => console.error('markIssuesSeenAction failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
