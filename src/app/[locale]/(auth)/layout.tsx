import Image from 'next/image';
import { LanguageSwitcher } from '@/components/language-switcher';
import { PRESET_THEMES } from '@/lib/background-themes';

const GLASS_CONTROL = 'border-white/30 bg-white/10 text-white hover:bg-white/20';

// Pre-auth pages have no session yet, so there's no per-user background
// preference to read (that's a Settings-driven, authenticated feature —
// see BackgroundProvider's own comment on why it doesn't reach here). This
// uses the same "nature" preset as the signed-in default instead of a
// disconnected gradient, so the very first screen someone sees already
// reads as the same product as the glass/photo shell behind the login wall.
const AUTH_BACKGROUND = PRESET_THEMES[0].url;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      <div className="fixed inset-0 -z-20 bg-slate-900">
        <Image
          src={AUTH_BACKGROUND}
          alt=""
          fill
          priority
          quality={75}
          sizes="100vw"
          className="object-cover object-center"
        />
      </div>
      <div className="fixed inset-0 -z-10 bg-black/50" />

      <div className="relative z-10 flex justify-end gap-3 p-4">
        <LanguageSwitcher className={GLASS_CONTROL} />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}
