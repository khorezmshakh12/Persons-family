import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './types';

let authListenerAttached = false;

export function createClient() {
  // createBrowserClient caches and returns the same underlying client (and
  // the same Realtime connection) for a given URL+key across every call
  // site in the tab, so this guard only needs to run once per page load,
  // not once per component that calls createClient().
  const client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
  );

  if (!authListenerAttached) {
    authListenerAttached = true;
    // Every realtime feature (chat, presence, notifications, announcements)
    // calls client.realtime.setAuth() once at mount so Realtime's own RLS
    // check has a valid JWT. That token silently rotates in the background
    // with nothing to re-arm it afterward — registering this once, here,
    // keeps every subscription's auth current for the life of the tab
    // instead of duplicating the same re-arm logic in five components.
    client.auth.onAuthStateChange((_event, session) => {
      if (session) client.realtime.setAuth(session.access_token);
    });
  }

  return client;
}
