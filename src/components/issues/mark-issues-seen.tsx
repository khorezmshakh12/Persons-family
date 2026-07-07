'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Fire-and-forget: the RPC is security-definer and scoped to
// assigned_to = auth.uid(), so calling it on every /issues visit is safe
// even though most visitors have nothing assigned to them.
export function MarkIssuesSeen() {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_issues_seen');
  }, []);

  return null;
}
