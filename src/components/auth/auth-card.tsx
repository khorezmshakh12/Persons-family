'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';

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
    // No entrance animation: this card wraps the entire login form, the gate
    // to the whole app. `animate-fade-in-up` is a `both`-fill keyframe whose
    // `from` is opacity:0 — if it ever stalls (as `animate-page-enter` did on
    // the app wrapper), the login screen goes blank. Not worth the risk here.
    <div className="relative z-10 w-full max-w-md rounded-au-card border border-au-line bg-au-card p-10 text-au-ink shadow-au-card">
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
          className=""
        />
        {tagline && (
          <p className="mt-3 text-sm font-semibold tracking-wide text-au-ink">{tagline}</p>
        )}
        <h1 className="font-heading mt-2 text-2xl font-bold tracking-tight text-au-ink">
          {title}
        </h1>
        <p className="text-sm text-au-muted">{subtitle}</p>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}

