import { LanguageSwitcher } from '@/components/language-switcher';

const LIGHT_CONTROL =
  'border-slate-200 bg-white/70 text-slate-600 shadow-sm hover:bg-white hover:text-slate-900 dark:border-zinc-700 dark:bg-zinc-900/70 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50 dark:from-black dark:via-zinc-950 dark:to-black">
      <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-teal-300/30 blur-3xl dark:bg-teal-500/10" />
      <div className="pointer-events-none absolute top-1/3 -right-24 size-80 rounded-full bg-emerald-300/25 blur-3xl dark:bg-emerald-500/10" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 size-72 rounded-full bg-sky-200/25 blur-3xl dark:bg-zinc-500/10" />

      <div className="relative z-10 flex justify-end gap-3 p-4">
        <LanguageSwitcher className={LIGHT_CONTROL} />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}
