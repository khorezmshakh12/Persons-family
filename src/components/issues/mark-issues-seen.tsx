'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: the RPC is security-definer and scoped to
// assigned_to = auth.uid(), so calling it on every /issues visit is safe
// even though most visitors have nothing assigned to them.
export function MarkIssuesSeen() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_issues_seen').then(({ error }) => {
      if (error) console.error('mark_issues_seen failed', error);
      // Clears the sidebar's green dot immediately — see mark-tasks-seen.tsx.
      else router.refresh();
    });
  }, [router]);

  return null;
}
