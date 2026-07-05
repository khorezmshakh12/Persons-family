import { LanguageSwitcher } from '@/components/language-switcher';
import { ThemeToggle } from '@/components/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-end gap-3 p-4">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
