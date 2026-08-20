'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getCurrentAnnouncementAction } from '@/lib/actions/announcements';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';

export function AnnouncementBanner({ initialMessage }: { initialMessage: string | null }) {
  const [message, setMessage] = useState(initialMessage);
  const [dismissed, setDismissed] = useState(false);
  // Only reset the dismiss state on a genuine new message, not on every
  // signal fire (clearAnnouncementAction bumps the signal too, and a
  // publish immediately after a clear shouldn't un-dismiss a banner the
  // viewer already closed for the *previous* message).
  const previousMessage = useRef(initialMessage);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const refresh = async () => {
      const next = await getCurrentAnnouncementAction();
      if (cancelled) return;
      if (next !== previousMessage.current) {
        previousMessage.current = next;
        setDismissed(false);
      }
      setMessage(next);
    };

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(doc(getRealtimeDb(), 'announcements_signal', 'current'), () => refresh());
      })
      .catch((error) => console.error('announcement banner realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
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
          className="fixed inset-x-0 top-0 z-100 flex items-center justify-center gap-3 bg-black px-4 py-2.5 text-sm font-medium text-white shadow-lg"
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
