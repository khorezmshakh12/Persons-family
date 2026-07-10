'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function AnnouncementBanner({ initialMessage }: { initialMessage: string | null }) {
  const [message, setMessage] = useState(initialMessage);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('platform_announcements')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'platform_announcements' },
          (payload) => {
            setMessage((payload.new as { message: string }).message);
            setDismissed(false);
          },
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'platform_announcements' }, () => {
          setMessage(null);
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <AnimatePresence>
      {message && !dismissed && (
        <motion.div
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed inset-x-0 top-0 z-100 flex items-center justify-center gap-3 bg-gradient-to-r from-teal-500 to-emerald-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          <span className="truncate">📢 {message}</span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
