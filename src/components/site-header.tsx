'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { LanguageSwitcher } from '@/components/language-switcher';

function NavItems({ className }: { className?: string }) {
  const t = useTranslations('nav');
  const items = [
    t('dashboard'),
    t('staff'),
    t('attendance'),
    t('chat'),
    t('issues'),
    t('lessonPlans'),
  ];

  return (
    <ul className={className}>
      {items.map((label) => (
        <li key={label} className="text-muted-foreground text-sm font-medium">
          {label}
        </li>
      ))}
    </ul>
  );
}

export function SiteHeader() {
  const t = useTranslations('app');
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
        <span className="text-sm font-semibold tracking-tight">{t('name')}</span>

        <NavItems className="hidden items-center gap-6 md:flex" />

        <div className="flex items-center gap-2">
          <LanguageSwitcher />

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={<Button variant="outline" size="icon" className="md:hidden" aria-label="Menu" />}
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="right">
              <NavItems className="mt-8 flex flex-col gap-4 px-4" />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
