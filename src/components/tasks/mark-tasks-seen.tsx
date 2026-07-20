'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Fire-and-forget: the RPC is security-definer and scoped to
// assigned_to = auth.uid(), so calling it on every /tasks visit is safe
// even for a visitor with nothing assigned to them. Mirrors
// components/issues/mark-issues-seen.tsx exactly.
export function MarkTasksSeen() {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_tasks_seen').then(({ error }) => {
      if (error) console.error('mark_tasks_seen failed', error);
    });
  }, []);

  return null;
}
