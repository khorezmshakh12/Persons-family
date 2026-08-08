import { LanguageSwitcher } from '@/components/language-switcher';
import { AuthVideoBackground } from '@/components/auth/auth-video-background';

const GLASS_CONTROL = 'border-white/30 bg-white/10 text-white hover:bg-white/20';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="fixed inset-0 -z-20 overflow-hidden bg-black">
        <AuthVideoBackground />
      </div>
      <div className="fixed inset-0 -z-10 bg-black/50" />

      <div className="relative z-10 flex justify-end gap-3 p-4">
        <LanguageSwitcher className={GLASS_CONTROL} />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}
