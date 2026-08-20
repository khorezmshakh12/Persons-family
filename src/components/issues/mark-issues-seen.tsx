'use client';

import { useEffect } from 'react';
import { markIssuesSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markIssuesSeenAction is scoped server-side to the
// caller's own uid, so calling it on every /issues visit is safe even
// though most visitors have nothing assigned to them.
export function MarkIssuesSeen() {
  const router = useRouter();

  useEffect(() => {
    markIssuesSeenAction()
      .then(() => router.refresh()) // Clears the sidebar's green dot immediately — see mark-tasks-seen.tsx.
      .catch((error) => console.error('markIssuesSeenAction failed', error));
  }, [router]);

  return null;
}
