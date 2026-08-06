'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: the RPC is security-definer and scoped to
// staff_id = auth.uid(), so calling it on every own-profile visit is safe.
// Mirrors components/tasks/mark-tasks-seen.tsx exactly.
export function MarkWarningsSeen() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_warnings_seen').then(({ error }) => {
      if (error) console.error('mark_warnings_seen failed', error);
      // Clears the sidebar's green dot immediately — the layout that
      // renders it is a cached Server Component, so without this it would
      // only pick up the now-seen state on the next full navigation/reload.
      else router.refresh();
    });
  }, [router]);

  return null;
}
