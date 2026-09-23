'use client';

import { useState, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SidebarPanel } from './sidebar-panel';

/** Below 960px the sidebar becomes a left drawer with the same content. */
export function MobileNav(props: Omit<ComponentProps<typeof SidebarPanel>, 'onNavigate'>) {
  const t = useTranslations('shell');
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={t('menu')}
            className="grid size-[38px] shrink-0 place-items-center rounded-au-ctl border border-au-line bg-au-card text-au-muted transition-colors hover:text-au-ink"
          />
        }
      >
        <Menu className="size-[17px]" strokeWidth={1.75} />
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] max-w-[85vw] bg-au-sidebar px-3.5 py-5">
        <SheetTitle className="sr-only">{t('menu')}</SheetTitle>
        <SidebarPanel {...props} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
