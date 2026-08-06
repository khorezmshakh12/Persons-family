'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { usePathname } from '@/i18n/navigation';

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
