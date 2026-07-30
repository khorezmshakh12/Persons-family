'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: the RPC is security-definer and scoped to
// assigned_to = auth.uid(), so calling it on every /tasks visit is safe
// even for a visitor with nothing assigned to them. Mirrors
// components/issues/mark-issues-seen.tsx exactly.
export function MarkTasksSeen() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_tasks_seen').then(({ error }) => {
      if (error) console.error('mark_tasks_seen failed', error);
      // Clears the sidebar's green dot immediately — the layout that
      // renders it is a cached Server Component, so without this it would
      // only pick up the now-seen state on the next full navigation/reload.
      else router.refresh();
    });
  }, [router]);

  return null;
}
