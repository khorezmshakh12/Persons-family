'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, Settings2, UserRoundCog } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useRouter } from '@/i18n/navigation';
import { setActiveRoleAction } from '@/lib/actions/profile-roles';
import { cn } from '@/lib/utils';

/** Header switcher for people holding several positions: pick the one you
 * work in now (the whole site follows it). CEO / COO also get a link to the
 * Lavozimlar page. Hidden for a single-position person without that right. */
export function RoleSwitcher({ roles, active, canManage }: { roles: string[]; active: string; canManage: boolean }) {
  const t = useTranslations('roleSwitcher');
  const tr = useTranslations('staff.roles');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (roles.length < 2 && !canManage) return null;

  const pick = (role: string) => {
    setOpen(false);
    if (role === active) return;
    start(async () => {
      const res = await setActiveRoleAction(role);
      if (res?.error) return void toast.error(t('failed'));
      toast.success(t('switched', { role: tr(role) }));
      router.refresh();
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('title')}
        className={cn(
          'flex h-9 items-center gap-1.5 rounded-full border border-au-line bg-au-card px-3 text-[13px] font-semibold text-au-ink shadow-[var(--au-shadow-btn)] transition-opacity',
          pending && 'opacity-60',
        )}
      >
        <UserRoundCog className="size-4 text-au-accent-text" />
        <span className="hidden max-w-[150px] truncate sm:inline">{tr(active)}</span>
        {roles.length > 1 && <span className="rounded-full bg-au-accent-soft px-1.5 text-[11px] text-au-accent-text">{roles.length}</span>}
        <ChevronDown className="size-3.5 text-au-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-50 w-64 rounded-xl border border-au-line bg-au-card p-1.5 shadow-[var(--au-shadow-card)]">
          <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-au-muted uppercase">{t('title')}</div>
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === active}
              onClick={() => pick(r)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-au-card-2', r === active && 'font-semibold text-au-accent-text')}
            >
              <span className="flex-1 truncate">{tr(r)}</span>
              {r === active && <Check className="size-4" />}
            </button>
          ))}
          {canManage && (
            <Link href="/roles" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 border-t border-au-line px-2.5 pt-2 pb-1.5 text-sm text-au-muted hover:text-au-ink">
              <Settings2 className="size-4" /> {t('manage')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
