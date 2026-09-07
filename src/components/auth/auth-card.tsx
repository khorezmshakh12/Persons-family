'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function AuthCard({
  title,
  subtitle,
  tagline,
  children,
}: {
  title: string;
  subtitle: string;
  tagline?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative z-10 w-full max-w-md rounded-3xl border border-white/20 bg-white/10 p-10 text-white shadow-2xl backdrop-blur-md"
    >
      <div className="flex flex-col items-center gap-1 text-center">
        {/* unoptimized: next/image's optimizer doesn't correctly prefix the
         * basePath onto its internal url= query param when this app is
         * mounted under /staff (confirmed via a 400 from /staff/_next/image),
         * so it's served as a plain static asset instead — a fixed 56x56
         * logo has nothing worth Next's on-the-fly resizing anyway.
         * unoptimized mode also skips next/image's own basePath-prefixing
         * of `src` (only the optimizer wrapper URL gets that), so the
         * basePath is prepended by hand here instead — matches
         * next.config.ts's basePath: '/staff' exactly, not derived at
         * runtime since this app is only ever deployed at that one path. */}
        <Image
          src="/staff/logo.png"
          alt="Persons"
          width={56}
          height={56}
          priority
          unoptimized
          className="drop-shadow-sm"
        />
        {tagline && (
          <p className="mt-3 text-sm font-semibold tracking-wide text-white/80">{tagline}</p>
        )}
        <h1 className="font-heading mt-2 text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {title}
        </h1>
        <p className="text-sm text-white/60">{subtitle}</p>
      </div>

      <div className="mt-8">{children}</div>
    </motion.div>
  );
}
