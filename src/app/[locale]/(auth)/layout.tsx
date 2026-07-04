import { LanguageSwitcher } from '@/components/language-switcher';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex justify-end p-4">
        <LanguageSwitcher />
      </div>
      {children}
    </div>
  );
}
