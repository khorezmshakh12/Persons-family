'use client';

import { useEffect, useRef } from 'react';
import { markCompanyNewsSeenAction } from '@/lib/actions/notifications';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: markCompanyNewsSeenAction just upserts a read receipt
// for the caller server-side, so calling it on every /company-news visit
// is safe. Mirrors components/issues/mark-issues-seen.tsx.
export function MarkCompanyNewsSeen() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    // Mount-only. `useRouter()` from next-intl returns a NEW object on every
    // render, so listing it in the dep array while calling `router.refresh()`
    // inside the effect is an infinite loop: refresh() -> re-render -> new
    // router ref -> effect re-runs -> action + refresh() -> ... This pegged
    // the dashboard with a POST/RSC storm for every logged-in user. The
    // ran-ref and the `changed` guard below are belt-and-braces on top.
    if (ran.current) return;
    ran.current = true;
    markCompanyNewsSeenAction()
      .then((changed) => {
        if (changed) router.refresh(); // Clears the sidebar's green dot immediately.
      })
      .catch((error) => console.error('markCompanyNewsSeenAction failed', error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
