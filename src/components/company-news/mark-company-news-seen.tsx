'use client';

import { useEffect } from 'react';
import { markCompanyNewsSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markCompanyNewsSeenAction just upserts a read receipt
// for the caller server-side, so calling it on every /company-news visit
// is safe. Mirrors components/issues/mark-issues-seen.tsx.
export function MarkCompanyNewsSeen() {
  const router = useRouter();

  useEffect(() => {
    markCompanyNewsSeenAction()
      .then(() => router.refresh()) // Clears the sidebar's green dot immediately — see mark-tasks-seen.tsx.
      .catch((error) => console.error('markCompanyNewsSeenAction failed', error));
  }, [router]);

  return null;
}
