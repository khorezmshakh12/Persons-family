'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Fire-and-forget: the RPC is security-definer and just upserts a read
// receipt for the caller, so calling it on every /company-news visit is
// safe. Mirrors components/issues/mark-issues-seen.tsx.
export function MarkCompanyNewsSeen() {
  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_company_news_seen').then(({ error }) => {
      if (error) console.error('mark_company_news_seen failed', error);
    });
  }, []);

  return null;
}
