'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from '@/i18n/navigation';

// Fire-and-forget: the RPC is security-definer and just upserts a read
// receipt for the caller, so calling it on every /company-news visit is
// safe. Mirrors components/issues/mark-issues-seen.tsx.
export function MarkCompanyNewsSeen() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc('mark_company_news_seen').then(({ error }) => {
      if (error) console.error('mark_company_news_seen failed', error);
      // Clears the sidebar's green dot immediately — see mark-tasks-seen.tsx.
      else router.refresh();
    });
  }, [router]);

  return null;
}
