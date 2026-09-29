'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { setSectionAccessAction } from '@/lib/actions/platform';
import { CEO_ONLY_OVERRIDES, OVERRIDABLE_SECTIONS, canSee, type SectionKey } from '@/lib/permissions';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { RolePerson } from '@/components/roles/roles-manager';

type Value = 'default' | 'allow' | 'deny';

/** Per-person section access: pick a person, then per section keep the
 * position's default or force it open / closed. Takes effect on their next
 * page load (checked on every request). */
export function SectionAccess({
  people,
  overrides,
  actorId,
  actorIsCeo,
}: {
  people: RolePerson[];
  overrides: Record<string, Record<string, boolean>>;
  actorId: string;
  actorIsCeo: boolean;
}) {
  const t = useTranslations('platform.access');
  const tNav = useTranslations('nav');
  const tr = useTranslations('staff.roles');
  const router = useRouter();
  const [sel, setSel] = useState(people.find((p) => p.id !== actorId)?.id ?? people[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const person = people.find((p) => p.id === sel);
  const held = useMemo(() => (person ? [person.primary_role, ...person.extra] : []), [person]);
  const locked = !actorIsCeo && held.includes('ceo');
  const mine = overrides[sel] ?? {};

  const set = (section: SectionKey, value: Value) => {
    setBusy(section);
    start(async () => {
      const res = await setSectionAccessAction(sel, section, value);
      setBusy(null);
      if (res?.error) {
        const key = `errors.${res.error}`;
        return void toast.error(t.has(key) ? t(key as 'errors.saveFailed') : t('errors.saveFailed'));
      }
      toast.success(t('saved'));
      router.refresh();
    });
  };

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-4 sm:p-5')}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="sa-person" className="text-sm font-semibold text-au-ink">
          {t('person')}
        </label>
        <select
          id="sa-person"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
          className="h-10 flex-1 rounded-au-ctl border border-au-line bg-au-card px-3 text-sm"
        >
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.first_name} {p.last_name} — {tr(p.primary_role)}
              {Object.keys(overrides[p.id] ?? {}).length ? ` · ${t('customised')}` : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-au-muted">{t('hint')}</p>
      {locked && <p className="rounded-au-ctl bg-au-card-2 p-3 text-sm text-au-muted">{t('ceoLocked')}</p>}
      <ul className="divide-y divide-au-line">
        {OVERRIDABLE_SECTIONS.map((s) => {
          const def = held.some((r) => canSee(r, s));
          const cur: Value = s in mine ? (mine[s] ? 'allow' : 'deny') : 'default';
          const ceoOnly = !actorIsCeo && CEO_ONLY_OVERRIDES.includes(s);
          const disabled = locked || busy !== null || ceoOnly;
          const eff = cur === 'default' ? def : cur === 'allow';
          return (
            <li key={s} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2">
                <span className={cn('size-2 rounded-full transition-colors', eff ? 'bg-au-ok' : 'bg-au-line')} aria-hidden />
                <span className="font-medium text-au-ink">{tNav(s)}</span>
                {ceoOnly && <span className="text-[11px] text-au-faint">{t('ceoOnlyTag')}</span>}
              </div>
              <div role="radiogroup" aria-label={tNav(s)} className="inline-flex gap-0.5 rounded-[9px] border border-au-line bg-au-card-2 p-[3px]">
                {(['default', 'allow', 'deny'] as Value[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={cur === v}
                    disabled={disabled}
                    onClick={() => cur !== v && set(s, v)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                      cur === v ? 'bg-au-card text-au-ink shadow-sm' : 'text-au-muted hover:text-au-ink',
                      busy === s && cur !== v && 'animate-pulse',
                    )}
                  >
                    {v === 'default' ? t(def ? 'defaultOn' : 'defaultOff') : t(v)}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
