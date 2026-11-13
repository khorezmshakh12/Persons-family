'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { setRoleAccessAction, setSectionAccessAction } from '@/lib/actions/platform';
import {
  OVERRIDABLE_SECTIONS,
  ROLES,
  SECTION_FUNCTIONS,
  isCeoOnlyAccessKey,
  roleDefault,
  type SectionKey,
} from '@/lib/permissions';
import { SURFACE_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import type { RolePerson } from '@/components/roles/roles-manager';

type Value = 'default' | 'allow' | 'deny';
type Mode = 'role' | 'person';
type Overrides = Record<string, Record<string, boolean>>;

/** next-intl nests on dots, so 'selfDev.viewAll' is stored as 'selfDev_viewAll'. */
const fnMsg = (key: string) => key.replace(/\./g, '_');

/** Section access v2: per role (everyone in that position) or per person,
 * each section and the functions inside it keep the default or are forced
 * open / closed. A person's own setting wins over the role's. Takes effect on
 * the next page load (checked on every request). */
export function SectionAccess({
  people,
  overrides,
  roleOverrides,
  actorId,
  actorIsCeo,
}: {
  people: RolePerson[];
  overrides: Overrides;
  roleOverrides: Overrides;
  actorId: string;
  actorIsCeo: boolean;
}) {
  const t = useTranslations('platform.access');
  const tNav = useTranslations('nav');
  const tr = useTranslations('staff.roles');
  const router = useRouter();
  const roles = ROLES.filter((r) => r !== 'ceo');
  const [mode, setMode] = useState<Mode>('role');
  const [selRole, setSelRole] = useState<string>(roles.includes('hr_manager') ? 'hr_manager' : roles[0]);
  const [selPerson, setSelPerson] = useState(people.find((p) => p.id !== actorId)?.id ?? people[0]?.id ?? '');
  const [open, setOpen] = useState<Set<string>>(() => new Set(Object.keys(SECTION_FUNCTIONS)));
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  const person = people.find((p) => p.id === selPerson);
  const held = useMemo(() => (person ? [person.primary_role, ...person.extra] : []), [person]);
  const locked = mode === 'person' && !actorIsCeo && held.includes('ceo');
  const mine = mode === 'role' ? (roleOverrides[selRole] ?? {}) : (overrides[selPerson] ?? {});

  // What applies without this row's own setting.
  const roleValue = (role: string, key: string) => {
    const o = roleOverrides[role]?.[key];
    return typeof o === 'boolean' ? o : roleDefault(role, key);
  };
  const baseOf = (key: string) =>
    mode === 'role' ? roleDefault(selRole, key) : held.some((r) => roleValue(r, key));
  const effOf = (key: string) => (key in mine ? mine[key] : baseOf(key));

  const set = (key: string, value: Value) => {
    setBusy(key);
    start(async () => {
      const res =
        mode === 'role'
          ? await setRoleAccessAction(selRole, key, value)
          : await setSectionAccessAction(selPerson, key, value);
      setBusy(null);
      if (res?.error) {
        const k = `errors.${res.error}`;
        return void toast.error(t.has(k) ? t(k as 'errors.saveFailed') : t('errors.saveFailed'));
      }
      toast.success(t('saved'));
      router.refresh();
    });
  };

  const seg = (key: string, label: string) => {
    const base = baseOf(key);
    const cur: Value = key in mine ? (mine[key] ? 'allow' : 'deny') : 'default';
    const ceoOnly = !actorIsCeo && isCeoOnlyAccessKey(key);
    const disabled = locked || busy !== null || ceoOnly;
    const defLabel =
      mode === 'role' ? t(base ? 'defaultOn' : 'defaultOff') : t(base ? 'byRoleOn' : 'byRoleOff');
    return (
      <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 self-start rounded-[9px] border border-au-line bg-au-card-2 p-[3px] sm:self-auto">
        {(['default', 'allow', 'deny'] as Value[]).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={cur === v}
            disabled={disabled}
            onClick={() => cur !== v && set(key, v)}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-50',
              cur === v ? 'bg-au-card text-au-ink shadow-sm' : 'text-au-muted hover:text-au-ink',
              cur === v && v === 'allow' && 'text-au-ok',
              cur === v && v === 'deny' && 'text-au-bad',
              busy === key && cur !== v && 'animate-pulse',
            )}
          >
            {v === 'default' ? defLabel : t(v)}
          </button>
        ))}
      </div>
    );
  };

  const toggle = (s: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  const enabledFns = OVERRIDABLE_SECTIONS.flatMap((s) =>
    effOf(s) ? (SECTION_FUNCTIONS[s] ?? []).filter((f) => effOf(f.key)).map((f) => f.key) : [],
  );
  const who =
    mode === 'role' ? tr(selRole) : person ? `${person.first_name} ${person.last_name}` : '—';

  return (
    <div className={cn(SURFACE_CARD, 'flex flex-col gap-4 p-4 sm:p-5')}>
      <div role="tablist" aria-label={t('mode')} className="inline-flex gap-0.5 self-start rounded-[10px] border border-au-line bg-au-card-2 p-[3px]">
        {(['role', 'person'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors',
              mode === m ? 'bg-au-card text-au-ink shadow-sm' : 'text-au-muted hover:text-au-ink',
            )}
          >
            {t(m === 'role' ? 'byRole' : 'byPerson')}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="sa-pick" className="text-sm font-semibold text-au-ink">
          {t(mode === 'role' ? 'role' : 'person')}
        </label>
        {mode === 'role' ? (
          <select
            id="sa-pick"
            value={selRole}
            onChange={(e) => setSelRole(e.target.value)}
            className="h-10 flex-1 rounded-au-ctl border border-au-line bg-au-card px-3 text-sm"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {tr(r)}
                {Object.keys(roleOverrides[r] ?? {}).length ? ` · ${t('customised')}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <select
            id="sa-pick"
            value={selPerson}
            onChange={(e) => setSelPerson(e.target.value)}
            className="h-10 flex-1 rounded-au-ctl border border-au-line bg-au-card px-3 text-sm"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.first_name} {p.last_name} — {tr(p.primary_role)}
                {Object.keys(overrides[p.id] ?? {}).length ? ` · ${t('customised')}` : ''}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-au-muted">{t(mode === 'role' ? 'hintRole' : 'hint')}</p>
      {locked && <p className="rounded-au-ctl bg-au-card-2 p-3 text-sm text-au-muted">{t('ceoLocked')}</p>}

      <ul className="divide-y divide-au-line">
        {OVERRIDABLE_SECTIONS.map((s: SectionKey) => {
          const fns = SECTION_FUNCTIONS[s] ?? [];
          const isOpen = open.has(s);
          const secOn = effOf(s);
          return (
            <li key={s} className="py-1">
              <div className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-center gap-2">
                  {fns.length ? (
                    <button
                      type="button"
                      onClick={() => toggle(s)}
                      aria-expanded={isOpen}
                      aria-label={t('functionsOf', { section: tNav(s) })}
                      className="rounded-md p-0.5 text-au-muted hover:bg-au-card-2 hover:text-au-ink"
                    >
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  ) : (
                    <span className="w-5" aria-hidden />
                  )}
                  <span className={cn('size-2 rounded-full transition-colors', secOn ? 'bg-au-ok' : 'bg-au-line')} aria-hidden />
                  <span className="font-medium text-au-ink">{tNav(s)}</span>
                  {fns.length > 0 && <span className="text-[11px] text-au-faint">{t('fnCount', { n: fns.length })}</span>}
                  {isCeoOnlyAccessKey(s) && <span className="text-[11px] text-au-faint">{t('ceoOnlyTag')}</span>}
                </div>
                {seg(s, tNav(s))}
              </div>
              {fns.length > 0 && isOpen && (
                <ul className="mb-2 ml-6 border-l-2 border-au-line pl-3.5">
                  {fns.map((f) => {
                    const name = t(`fn.${fnMsg(f.key)}.name` as 'fn.selfDev_viewAll.name');
                    return (
                      <li key={f.key} className="flex flex-col gap-2 py-1.5 sm:flex-row sm:items-center">
                        <div className="flex flex-1 items-start gap-2">
                          <span
                            className={cn('mt-1.5 size-2 shrink-0 rounded-full transition-colors', secOn && effOf(f.key) ? 'bg-au-ok' : 'bg-au-line')}
                            aria-hidden
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-au-ink">{name}</span>
                            {f.ceoOnly && <span className="ml-1.5 text-[11px] text-au-faint">{t('ceoOnlyTag')}</span>}
                            <span className="block text-xs text-au-muted">
                              {t(`fn.${fnMsg(f.key)}.desc` as 'fn.selfDev_viewAll.desc')}
                            </span>
                          </span>
                        </div>
                        {seg(f.key, name)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-au-ctl bg-au-card-2 p-3 text-sm">
        {t('summary', { who })}
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {enabledFns.length ? (
            enabledFns.map((k) => (
              <span key={k} className="rounded-full bg-au-ok-soft px-2.5 py-0.5 text-xs font-semibold text-au-ok">
                {t(`fn.${fnMsg(k)}.name` as 'fn.selfDev_viewAll.name')}
              </span>
            ))
          ) : (
            <span className="text-xs text-au-faint">{t('none')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
