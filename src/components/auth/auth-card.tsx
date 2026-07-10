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
    <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/30 bg-white/20 p-10 text-slate-700 shadow-2xl backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-300">
      <div className="flex flex-col items-center gap-1 text-center">
        <Image src="/logo.png" alt="Persons" width={56} height={56} priority className="drop-shadow-sm" />
        {tagline && (
          <p className="mt-3 text-sm font-semibold tracking-wide text-teal-700 dark:text-teal-400">{tagline}</p>
        )}
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400">{subtitle}</p>
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
