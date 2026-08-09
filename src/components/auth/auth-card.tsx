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
        <Image src="/logo.png" alt="Persons" width={56} height={56} priority className="drop-shadow-sm" />
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
