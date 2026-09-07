'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from '@/i18n/navigation';
import { clearChunkErrorGuard } from '@/lib/chunk-error';
import { useMotion } from '@/lib/motion';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { shouldReduce, durations, easings } = useMotion();

  // Any successful render here means the app is healthy on the current
  // bundle, so clear the chunk-error reload guard — otherwise a tab that
  // hit one stale-chunk error would only ever get the automatic reload
  // once, instead of once per actual incident.
  useEffect(() => {
    clearChunkErrorGuard();
  }, [pathname]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: shouldReduce ? 1 : 0.8, y: shouldReduce ? 0 : -4 }}
        transition={{ duration: durations.base, ease: easings.standard }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
