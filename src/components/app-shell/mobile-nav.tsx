'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar-nav';
import type { StaffRole } from '@/lib/nav';

export function MobileNav({ role, materialsLinked = false }: { role: StaffRole; materialsLinked?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Menu"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
          />
        }
      >
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left">
        <div className="mt-8 px-4">
          <SidebarNav role={role} materialsLinked={materialsLinked} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
