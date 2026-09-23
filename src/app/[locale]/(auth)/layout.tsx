import { LanguageSwitcher } from '@/components/language-switcher';

// Persons Aurora: warm cream page with a soft apricot mesh glow behind the
// card — no photo/video backdrop (AuthVideoBackground is no longer mounted).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-au-bg">
      <div
        aria-hidden
        className="pointer-events-none fixed top-1/2 left-1/2 z-0 size-[900px] max-w-[160vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-au-hero opacity-80 blur-3xl"
      />

      <div className="relative z-10 flex justify-end gap-3 p-4">
        <LanguageSwitcher compact />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}
