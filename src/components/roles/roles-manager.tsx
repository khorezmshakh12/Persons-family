'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { grantRoleAction, revokeRoleAction } from '@/lib/actions/profile-roles';
import { ROLES, canGrantRole } from '@/lib/permissions';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type RolePerson = { id: string; first_name: string; last_name: string; primary_role: string; extra: string[] };

export function RolesManager({ people, actorId, actorRoles }: { people: RolePerson[]; actorId: string; actorRoles: string[] }) {
  const t = useTranslations('rolesPage');
  const tr = useTranslations('staff.roles');
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const rows = s ? people.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(s)) : people;
    // Yourself first — the owner's main use is giving themselves positions.
    return [...rows].sort((a, b) => Number(b.id === actorId) - Number(a.id === actorId));
  }, [people, q, actorId]);

  const run = (key: string, fn: () => Promise<{ error?: string } | undefined>, ok: string) => {
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (res?.error) {
        const key = `errors.${res.error}`;
        return void toast.error(t.has(key) ? t(key as 'errors.saveFailed') : t('errors.saveFailed'));
      }
      toast.success(ok);
      router.refresh();
    });
  };

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-4 sm:p-5')}>
      <label className="flex items-center gap-2 rounded-au-ctl border border-au-line bg-au-card-2 px-3 py-2">
        <Search className="size-4 text-au-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('search')} className="w-full bg-transparent text-sm outline-none" />
      </label>
      <ul className="divide-y divide-au-line">
        {list.map((p) => {
          const held = [p.primary_role, ...p.extra.filter((r) => r !== p.primary_role)];
          const addable = ROLES.filter((r) => !held.includes(r) && canGrantRole(actorRoles, r, held));
          return (
            <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-[200px] font-semibold text-au-ink">
                {p.first_name} {p.last_name}
                {p.id === actorId && <span className="ml-2 rounded-full bg-au-accent-soft px-2 py-0.5 text-[11px] text-au-accent-text">{t('you')}</span>}
              </div>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                <span className="rounded-full border border-au-line bg-au-card-2 px-2.5 py-1 text-xs font-semibold text-au-ink" title={t('primaryHint')}>
                  {tr(p.primary_role)} · {t('primary')}
                </span>
                {p.extra.filter((r) => r !== p.primary_role).map((r) => (
                  <span key={r} className="flex items-center gap-1 rounded-full bg-au-accent-soft px-2.5 py-1 text-xs font-semibold text-au-accent-text">
                    {tr(r)}
                    {canGrantRole(actorRoles, r, held) && (
                      <button
                        type="button"
                        aria-label={t('remove', { role: tr(r) })}
                        disabled={busy !== null}
                        onClick={() => run(`${p.id}-${r}`, () => revokeRoleAction(p.id, r), t('removed', { role: tr(r) }))}
                        className="rounded-full p-0.5 hover:bg-au-card"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
                {addable.length > 0 && (
                  <span className="relative flex items-center">
                    <Plus className="pointer-events-none absolute left-2 size-3.5 text-au-muted" />
                    <select
                      value=""
                      disabled={busy !== null}
                      aria-label={t('add')}
                      onChange={(e) => e.target.value && run(`${p.id}+`, () => grantRoleAction(p.id, e.target.value), t('added', { role: tr(e.target.value) }))}
                      className="h-7 rounded-full border border-dashed border-au-line bg-transparent pr-2 pl-6 text-xs text-au-muted"
                    >
                      <option value="">{t('add')}</option>
                      {addable.map((r) => (
                        <option key={r} value={r}>
                          {tr(r)}
                        </option>
                      ))}
                    </select>
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
