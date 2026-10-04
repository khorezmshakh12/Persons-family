import { BgVideo } from '@/components/motion/bg-video';
import { LanguageSwitcher } from '@/components/language-switcher';

// Persons Aurora: the Aurora moving-gradient loop (public/bg/aurora.*)
// behind the sign-in card, under a light scrim.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col overflow-hidden bg-au-bg">
      <BgVideo variant="login" theme="aurora" />

      <div className="relative z-10 flex justify-end gap-3 p-4">
        <LanguageSwitcher compact />
      </div>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-8">{children}</div>
    </div>
  );
}
