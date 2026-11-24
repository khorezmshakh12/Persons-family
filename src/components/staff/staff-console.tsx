'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Ban,
  Bookmark,
  CheckCircle2,
  Clock3,
  KeyRound,
  LayoutGrid,
  List,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { SURFACE_CARD, CARD_TITLE, CHIP_BAD, CHIP_INFO, CHIP_NEUTRAL, CHIP_OK, CHIP_ACCENT, INPUT } from '@/lib/glass';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CountUp } from '@/components/motion/count-up';
import { OnlineDot } from '@/components/presence/online-dot';
import { ExportButtons } from '@/components/export/export-buttons';
import { StaffRowActions } from './staff-row-actions';
import { ResetPasswordDialog } from './reset-password-dialog';
import { DisconnectStaffTelegramButton } from './disconnect-staff-telegram-button';
import { bulkSetStaffActiveAction } from '@/lib/actions/staff';
import {
  canSeeFor,
  isProtectedRole,
  ROLE_DEPT,
  ROLES,
  SECTION_ROLES,
  type Department,
  type Role,
  type SectionKey,
} from '@/lib/permissions';
import type { AuditEntry, ConsoleAccount } from '@/lib/staff-console-data';
import type { Profile } from '@/lib/auth/session';

export type ConsoleTab = 'accounts' | 'access' | 'security' | 'audit';

const DAY = 86_400_000;
const STALE_DAYS = 30;

export const DEPT_LABEL: Record<Department, string> = {
  top: 'Rahbariyat',
  acad: 'Akademik',
  com: 'Tijorat',
  ops: 'Operatsiya',
  fin: 'Moliya',
  hr: 'HR',
};
const DEPT_TONE: Record<Department, string> = {
  top: 'var(--au-ink)',
  acad: 'var(--au-info)',
  com: 'var(--au-accent)',
  ops: 'var(--au-chart-2)',
  fin: 'var(--au-ok)',
  hr: 'var(--au-chart-3)',
};

/** Sections in the order the sidebar shows them; removed ones are left out. */
const SECTION_LABEL: [SectionKey, string][] = [
  ['dashboard', 'Boshqaruv paneli'],
  ['tasks', 'Vazifalar'],
  ['kpi', 'Mening KPI'],
  ['selfDevelopment', 'O‘z-o‘zini rivojlantirish'],
  ['taskTracker', 'Haftalik jadval'],
  ['issues', 'Muammolar'],
  ['companyNews', 'Yangiliklar'],
  ['lessonPlans', 'Dars rejalari'],
  ['operations', 'Operation HQ'],
  ['hr', 'HR'],
  ['staff', 'Xodimlar'],
  ['sales', 'Sotuv'],
  ['finance', 'Moliya'],
  ['accounting', 'Buxgalteriya'],
  ['strategy', 'Strategiya'],
  ['market', 'Market'],
  ['materials', 'Materiallar'],
  ['telegramSetup', 'Telegram sozlash'],
  ['platform', 'Platforma'],
  ['profile', 'Profil'],
  ['settings', 'Sozlamalar'],
];

const DEPTS: Department[] = ['top', 'acad', 'com', 'ops', 'fin', 'hr'];

/** Labels, relative times and dates in the viewer's language. */
function useSc() {
  const t = useTranslations('sc');
  const td = useTranslations('att.dept');
  const ts = useTranslations('sc.sec');
  const ta = useTranslations('sc.au');
  const locale = useLocale();
  const loc = locale === 'uz' ? 'uz-UZ' : locale;
  const dept = Object.fromEntries(DEPTS.map((d) => [d, d === 'hr' ? 'HR' : td(d)])) as Record<Department, string>;
  const sec = Object.fromEntries(SECTION_LABEL.map(([k]) => [k, ts(k)])) as Record<string, string>;
  return {
    t,
    dept,
    sec,
    au: (type: string) => (AUDIT_LABEL[type] ? ta(type.replace('.', '_')) : type),
    ago: (iso: string | null, now: number) => {
      if (!iso) return t('noData');
      const d = now - new Date(iso).getTime();
      if (d < 60_000) return t('justNow');
      if (d < 3_600_000) return t('minAgo', { n: Math.floor(d / 60_000) });
      if (d < DAY) return t('hAgo', { n: Math.floor(d / 3_600_000) });
      if (d < 30 * DAY) return t('dAgo', { n: Math.floor(d / DAY) });
      return t('moAgo', { n: Math.floor(d / (30 * DAY)) });
    },
    fd: (iso: string | null) => (iso ? new Intl.DateTimeFormat(loc, { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—'),
    fdt: (iso: string) => new Intl.DateTimeFormat(loc, { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(new Date(iso)),
  };
}

const AUDIT_LABEL: Record<string, { n: string; tone: string }> = {
  'staff.create': { n: 'Hisob yaratildi', tone: CHIP_OK },
  'staff.update': { n: 'Ma’lumot tahrirlandi', tone: CHIP_INFO },
  'staff.activate': { n: 'Faollashtirildi', tone: CHIP_OK },
  'staff.deactivate': { n: 'Nofaol qilindi', tone: CHIP_BAD },
  'staff.delete': { n: 'O‘chirildi', tone: CHIP_BAD },
  'staff.password_reset': { n: 'Parol tiklandi', tone: CHIP_ACCENT },
  'staff.telegram_disconnect': { n: 'Telegram uzildi', tone: CHIP_NEUTRAL },
  role_granted: { n: 'Lavozim berildi', tone: CHIP_INFO },
  role_revoked: { n: 'Lavozim olindi', tone: CHIP_NEUTRAL },
  section_access: { n: 'Bo‘lim ruxsati', tone: CHIP_ACCENT },
};

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const fullName = (a: Pick<Profile, 'first_name' | 'last_name'>) => `${a.first_name} ${a.last_name}`;

const dayKey = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

const isStale = (a: ConsoleAccount, now: number) =>
  a.is_active && !!a.last_seen_at && now - new Date(a.last_seen_at).getTime() > STALE_DAYS * DAY;
/** Still on the temporary password a manager handed out: never really signed in. */
const neverSignedIn = (a: ConsoleAccount, now: number) =>
  a.is_active && a.must_change_password && now - new Date(a.created_at).getTime() > 3 * DAY;
const deptOf = (role: string): Department => ROLE_DEPT[role as Role] ?? 'ops';

function Avatar({ a, size = 36 }: { a: ConsoleAccount; size?: number }) {
  const dept = deptOf(a.role);
  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {a.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
        <img src={a.avatarUrl} alt="" className="size-full rounded-full object-cover" style={{ viewTransitionName: `avatar-${a.id}` }} />
      ) : (
        <span
          className="grid size-full place-items-center rounded-full text-[13px] font-bold text-white uppercase"
          style={{ background: `color-mix(in oklab, ${DEPT_TONE[dept]} 85%, var(--au-card))` }}
        >
          {a.first_name[0]}
          {a.last_name[0]}
        </span>
      )}
      <OnlineDot userId={a.id} className="absolute right-0 bottom-0 size-2.5 border-2 border-au-card" />
    </span>
  );
}

function Kpi({ label, value, hint, Icon, tone, active, onClick, i }: {
  label: string;
  value: number;
  hint: string;
  Icon: typeof Users;
  tone: string;
  active?: boolean;
  onClick?: () => void;
  i: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ ['--i' as string]: i }}
      className={cn(
        SURFACE_CARD,
        'ms-rise flex flex-col gap-2 p-4 text-left transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-au-card-hover',
        active && 'ring-2 ring-au-accent',
      )}
    >
      <span className="flex items-center justify-between text-xs font-semibold text-au-muted">
        {label}
        <span className="grid size-7 place-items-center rounded-full" style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}>
          <Icon className="size-3.5" />
        </span>
      </span>
      <span className="text-[26px] leading-none font-bold tracking-tight text-au-ink tabular-nums">
        <CountUp value={String(value)} />
      </span>
      <span className="text-[11px] text-au-faint">{hint}</span>
    </button>
  );
}

/* ------------------------------------------------------------ accounts */

type Quick = 'all' | 'active' | 'inactive' | 'noTelegram' | 'stale' | 'temp';
type View = { name: string; q: string; dept: string; role: string; quick: Quick };
const VIEWS_KEY = 'persons-staff-views';
const LAYOUT_KEY = 'persons-staff-layout';

function readViews(): View[] {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function Accounts({ accounts, audit, now, currentUserId, actingRole, roleLabels, onOpen }: {
  accounts: ConsoleAccount[];
  audit: AuditEntry[];
  now: number;
  currentUserId: string;
  actingRole: Profile['role'];
  roleLabels: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const S = useSc();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [role, setRole] = useState('');
  const [quick, setQuick] = useState<Quick>('active');
  const [layout, setLayout] = useState<'table' | 'cards'>('table');
  const [views, setViews] = useState<View[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(0);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Per-viewer conveniences from localStorage — only readable after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViews(readViews());
    try {
      if (localStorage.getItem(LAYOUT_KEY) === 'cards') setLayout('cards');
    } catch {}
  }, []);

  const counts = {
    active: accounts.filter((a) => a.is_active).length,
    inactive: accounts.filter((a) => !a.is_active).length,
    noTelegram: accounts.filter((a) => a.is_active && !a.telegram_id).length,
    stale: accounts.filter((a) => isStale(a, now)).length,
    temp: accounts.filter((a) => a.is_active && a.must_change_password).length,
  };

  const needle = q.trim().toLowerCase();
  const rows = accounts.filter((a) => {
    if (quick === 'active' && !a.is_active) return false;
    if (quick === 'inactive' && a.is_active) return false;
    if (quick === 'noTelegram' && !(a.is_active && !a.telegram_id)) return false;
    if (quick === 'stale' && !isStale(a, now)) return false;
    if (quick === 'temp' && !(a.is_active && a.must_change_password)) return false;
    if (dept && deptOf(a.role) !== dept) return false;
    if (role && a.role !== role && !a.positions.includes(role)) return false;
    if (needle && !`${fullName(a)} ${a.phone} ${a.email ?? ''} ${roleLabels[a.role] ?? a.role}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const cur = Math.min(cursor, Math.max(0, rows.length - 1));

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));

  // Keyboard: / search · J/K move · Enter open · X select · Esc clear.
  const keys = useRef({ rows, cur, onOpen });
  useEffect(() => {
    keys.current = { rows, cur, onOpen };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (e.key === 'Escape') {
        if (typing) (t as HTMLElement).blur();
        setSel(new Set());
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const { rows: rs, cur: c } = keys.current;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setCursor(Math.min(rs.length - 1, c + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setCursor(Math.max(0, c - 1));
      } else if (e.key === 'Enter' && rs[c]) {
        keys.current.onOpen(rs[c].id);
      } else if (e.key === 'x' && rs[c]) {
        toggle(rs[c].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.querySelector(`[data-row="${cur}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cur]);

  const [naming, setNaming] = useState<string | null>(null);
  const saveView = () => {
    const name = naming?.trim();
    setNaming(null);
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, q, dept, role, quick }].slice(-8);
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {}
  };
  const dropView = (name: string) => {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {}
  };
  const setLayoutKept = (l: 'table' | 'cards') => {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {}
  };

  const bulk = (active: boolean) =>
    start(async () => {
      const r = await bulkSetStaffActiveAction([...sel], active);
      if (r.error) {
        toast.error(S.t('failed'));
        return;
      }
      toast.success(`${S.t('bulkDone', { n: r.changed ?? 0, a: active ? S.t('activated') : S.t('deactivated') })}${r.skipped ? S.t('skipped', { n: r.skipped }) : ''}`);
      setSel(new Set());
      router.refresh();
    });

  const exportRows = (sel.size ? accounts.filter((a) => sel.has(a.id)) : rows).map((a) => ({
    name: fullName(a),
    phone: a.phone,
    email: a.email ?? '',
    role: roleLabels[a.role] ?? a.role,
    positions: a.positions.map((p) => roleLabels[p] ?? p).join(', '),
    dept: S.dept[deptOf(a.role)],
    telegram: a.telegram_id ? S.t('yes') : S.t('no'),
    lastSeen: a.last_seen_at ? S.fd(a.last_seen_at) : '',
    created: S.fd(a.created_at),
    status: a.is_active ? S.t('active') : S.t('inactive'),
  }));

  const lastChange = (id: string) => audit.find((e) => e.description.includes(id));

  const quickKpis: { k: Quick; label: string; value: number; hint: string; Icon: typeof Users; tone: string }[] = [
    { k: 'active', label: S.t('kActive'), value: counts.active, hint: S.t('kActiveHint', { n: accounts.length }), Icon: Users, tone: 'var(--au-ok)' },
    { k: 'inactive', label: S.t('kInactive'), value: counts.inactive, hint: S.t('kInactiveHint'), Icon: Ban, tone: 'var(--au-muted)' },
    { k: 'noTelegram', label: S.t('kNoTg'), value: counts.noTelegram, hint: S.t('kNoTgHint'), Icon: Send, tone: 'var(--au-info)' },
    { k: 'stale', label: S.t('kStale', { n: STALE_DAYS }), value: counts.stale, hint: S.t('kStaleHint'), Icon: Clock3, tone: 'var(--au-accent)' },
    { k: 'temp', label: S.t('kTemp'), value: counts.temp, hint: S.t('kTempHint'), Icon: KeyRound, tone: 'var(--au-bad)' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {quickKpis.map((k, i) => (
          <Kpi key={k.k} {...k} i={i} active={quick === k.k} onClick={() => setQuick(quick === k.k ? 'all' : k.k)} />
        ))}
      </div>

      <div className={cn(SURFACE_CARD, 'flex flex-col gap-3 p-3 sm:p-4')}>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-au-faint" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={S.t('searchPh')}
              className={cn(INPUT, 'h-10 pl-9')}
            />
          </label>
          <select value={dept} onChange={(e) => setDept(e.target.value)} className={cn(INPUT, 'h-10 w-auto')} aria-label={S.t('dept')}>
            <option value="">{S.t('allDepts')}</option>
            {(DEPTS).map((d) => (
              <option key={d} value={d}>
                {S.dept[d]}
              </option>
            ))}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={cn(INPUT, 'h-10 w-auto')} aria-label={S.t('role')}>
            <option value="">{S.t('allRoles')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-au-ctl border border-au-line bg-au-card-2 p-1" role="group" aria-label={S.t('view')}>
            {(
              [
                ['table', List, S.t('table')],
                ['cards', LayoutGrid, S.t('cards')],
              ] as const
            ).map(([k, Icon, n]) => (
              <button
                key={k}
                type="button"
                aria-label={n}
                aria-pressed={layout === k}
                onClick={() => setLayoutKept(k)}
                className={cn('grid size-8 place-items-center rounded-[8px] transition-colors', layout === k ? 'bg-au-card text-au-ink shadow-au-card' : 'text-au-muted hover:text-au-ink')}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
          <ExportButtons
            filename="xodimlar"
            columns={[
              { header: S.t('cName'), key: 'name' },
              { header: S.t('cPhone'), key: 'phone' },
              { header: S.t('cEmail'), key: 'email' },
              { header: S.t('role'), key: 'role' },
              { header: S.t('cPositions'), key: 'positions' },
              { header: S.t('dept'), key: 'dept' },
              { header: 'Telegram', key: 'telegram' },
              { header: S.t('cLastSeen'), key: 'lastSeen' },
              { header: S.t('cCreated'), key: 'created' },
              { header: S.t('cStatus'), key: 'status' },
            ]}
            rows={exportRows}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-au-muted">{S.t('saved')}</span>
          {views.map((v) => (
            <span key={v.name} className="ms-pop-in inline-flex items-center rounded-full border border-au-line bg-au-card-2">
              <button
                type="button"
                className="px-2.5 py-1 font-semibold text-au-ink"
                onClick={() => {
                  setQ(v.q);
                  setDept(v.dept);
                  setRole(v.role);
                  setQuick(v.quick);
                }}
              >
                {v.name}
              </button>
              <button type="button" aria-label={S.t('dropView', { n: v.name })} className="pr-2 text-au-faint hover:text-au-bad" onClick={() => dropView(v.name)}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {naming === null ? (
            <button
              type="button"
              onClick={() => setNaming(roleLabels[role] ?? (dept ? S.dept[dept as Department] : ''))}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-au-accent-text hover:bg-au-accent-soft"
            >
              <Bookmark className="size-3" /> {S.t('saveFilter')}
            </button>
          ) : (
            <form
              className="ms-pop-in inline-flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                saveView();
              }}
            >
              <input
                autoFocus
                value={naming}
                onChange={(e) => setNaming(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
                placeholder={S.t('viewName')}
                maxLength={30}
                className="h-7 w-36 rounded-full border border-au-line bg-au-card px-3 text-xs focus:ring-2 focus:ring-au-accent/40 focus:outline-none"
              />
              <button type="submit" className={cn(CHIP_INFO, 'h-7 px-2.5')}>
                {S.t('save')}
              </button>
            </form>
          )}
          <span className="ml-auto text-au-faint">
            {S.t('keysHint', { n: rows.length })}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={cn(SURFACE_CARD, 'grid place-items-center gap-2 py-14 text-center')}>
          <Users className="size-8 text-au-faint" />
          <p className="text-sm font-semibold text-au-ink">{S.t('nobody')}</p>
          <button
            type="button"
            className="text-xs font-semibold text-au-accent-text"
            onClick={() => {
              setQ('');
              setDept('');
              setRole('');
              setQuick('all');
            }}
          >
            {S.t('clear')}
          </button>
        </div>
      ) : layout === 'table' ? (
        <div className={cn(SURFACE_CARD, 'overflow-x-auto')}>
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-au-line text-left text-[11px] font-semibold tracking-wide text-au-muted uppercase">
                <th className="w-10 py-3 pl-4">
                  <input
                    type="checkbox"
                    aria-label={S.t('selectAll')}
                    checked={allOn}
                    onChange={() => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="size-4 accent-[var(--au-ink)]"
                  />
                </th>
                <th className="py-3">{S.t('hStaff')}</th>
                <th className="py-3">{S.t('hRoleDept')}</th>
                <th className="py-3">{S.t('cLastSeen')}</th>
                <th className="py-3">{S.t('hSignin')}</th>
                <th className="py-3">{S.t('cStatus')}</th>
                <th className="py-3 pr-4 text-right">{S.t('hActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a, i) => {
                const dept = deptOf(a.role);
                const stale = isStale(a, now);
                const change = lastChange(a.id);
                return (
                  <tr
                    key={a.id}
                    data-row={i}
                    style={{ ['--i' as string]: Math.min(i, 12) }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button,a,input,[role="menu"]')) return;
                      setCursor(i);
                      onOpen(a.id);
                    }}
                    className={cn(
                      'ms-rise cursor-pointer border-b border-au-line/70 transition-colors last:border-0 hover:bg-au-card-2',
                      i === cur && 'bg-au-card-2 shadow-[inset_3px_0_0_var(--au-accent)]',
                      sel.has(a.id) && 'bg-au-accent-soft/60',
                      !a.is_active && 'opacity-70',
                    )}
                  >
                    <td className="py-3 pl-4">
                      <input
                        type="checkbox"
                        aria-label={S.t('select', { n: fullName(a) })}
                        checked={sel.has(a.id)}
                        onChange={() => toggle(a.id)}
                        className="size-4 accent-[var(--au-ink)]"
                      />
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar a={a} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-au-ink">
                            {fullName(a)}
                            {a.id === currentUserId && <span className="ml-1.5 text-[11px] font-medium text-au-faint">{S.t('you')}</span>}
                          </p>
                          <p className="truncate text-xs text-au-muted">{a.phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="font-medium text-au-ink">{roleLabels[a.role] ?? a.role}</span>
                        {isProtectedRole(a.role) && <ShieldCheck className="size-3.5 text-au-accent-text" aria-label={S.t('protected')} />}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-au-muted">
                        <i className="size-1.5 rounded-full" style={{ background: DEPT_TONE[dept] }} />
                        {S.dept[dept]}
                        {a.positions.length > 0 && <span className={cn(CHIP_NEUTRAL, 'h-5 px-1.5 text-[10px]')}>{S.t('nPos', { n: a.positions.length })}</span>}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={cn('text-xs', stale ? 'font-semibold text-au-bad' : 'text-au-muted')}>{S.ago(a.last_seen_at, now)}</span>
                      {change && <p className="mt-0.5 text-[11px] text-au-faint">{S.au(change.type)} · {S.fd(change.at)}</p>}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <span title={a.telegram_id ? S.t('tgOn') : S.t('kNoTg')} className={cn('grid size-6 place-items-center rounded-full', a.telegram_id ? 'bg-au-info-soft text-au-info' : 'bg-au-card-2 text-au-faint')}>
                          <Send className="size-3" />
                        </span>
                        {a.must_change_password && (
                          <span title={S.t('kTemp')} className="grid size-6 place-items-center rounded-full bg-au-bad-soft text-au-bad">
                            <KeyRound className="size-3" />
                          </span>
                        )}
                        {a.overrides.length > 0 && (
                          <span title={S.t('personalAccess')} className={cn(CHIP_ACCENT, 'h-6 px-1.5 text-[10px]')}>
                            {S.t('nAccess', { n: a.overrides.length })}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <span className={a.is_active ? CHIP_OK : a.frozen_reason === 'star_balance' ? CHIP_BAD : CHIP_NEUTRAL}>
                        {a.is_active ? S.t('stActive') : a.frozen_reason === 'star_balance' ? S.t('stFrozen') : S.t('stInactive')}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <StaffRowActions target={a} currentUserId={currentUserId} actingRole={actingRole} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((a, i) => {
            const dept = deptOf(a.role);
            return (
              <article
                key={a.id}
                data-row={i}
                style={{ ['--i' as string]: Math.min(i, 12) }}
                className={cn(
                  SURFACE_CARD,
                  'ms-rise relative flex flex-col gap-3 overflow-hidden p-4 transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-au-card-hover',
                  i === cur && 'ring-2 ring-au-accent',
                  !a.is_active && 'opacity-70',
                )}
              >
                <i className="absolute inset-x-0 top-0 h-1" style={{ background: DEPT_TONE[dept] }} />
                <div className="flex items-start gap-3">
                  <Avatar a={a} size={48} />
                  <div className="min-w-0 flex-1">
                    <button type="button" onClick={() => onOpen(a.id)} className="block max-w-full truncate text-left font-semibold text-au-ink hover:underline">
                      {fullName(a)}
                    </button>
                    <p className="truncate text-xs text-au-muted">
                      {roleLabels[a.role] ?? a.role} · {S.dept[dept]}
                    </p>
                  </div>
                  <input type="checkbox" aria-label={S.t('select', { n: fullName(a) })} checked={sel.has(a.id)} onChange={() => toggle(a.id)} className="size-4 accent-[var(--au-ink)]" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <span className={a.is_active ? CHIP_OK : CHIP_NEUTRAL}>{a.is_active ? S.t('stActive') : S.t('stInactive')}</span>
                  <span className={a.telegram_id ? CHIP_INFO : CHIP_NEUTRAL}>
                    <Send className="size-3" /> {a.telegram_id ? 'Telegram' : S.t('noTg')}
                  </span>
                  {a.must_change_password && <span className={CHIP_BAD}>{S.t('kTemp')}</span>}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-au-line pt-3">
                  <span className={cn('text-xs', isStale(a, now) ? 'font-semibold text-au-bad' : 'text-au-faint')}>{S.ago(a.last_seen_at, now)}</span>
                  <StaffRowActions target={a} currentUserId={currentUserId} actingRole={actingRole} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sel.size > 0 && (
        <div className="ms-rise fixed inset-x-0 bottom-[calc(16px+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-au-line bg-au-card px-4 py-2 shadow-au-pop">
            <span className="text-sm font-bold text-au-ink tabular-nums">{S.t('nSelected', { n: sel.size })}</span>
            <span className="h-5 w-px bg-au-line" />
            <button type="button" disabled={pending} onClick={() => bulk(true)} className={cn(CHIP_OK, 'h-8 px-3 disabled:opacity-50')}>
              <CheckCircle2 className="size-3.5" /> {S.t('activate')}
            </button>
            <button type="button" disabled={pending} onClick={() => bulk(false)} className={cn(CHIP_BAD, 'h-8 px-3 disabled:opacity-50')}>
              <Ban className="size-3.5" /> {S.t('deactivate')}
            </button>
            <button type="button" onClick={() => setSel(new Set())} aria-label={S.t('clearSel')} className="grid size-8 place-items-center rounded-full text-au-muted hover:bg-au-card-2">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ drawer */

function AccountDrawer({ a, audit, now, currentUserId, actingRole, roleLabels, nameOf, onClose }: {
  a: ConsoleAccount;
  audit: AuditEntry[];
  now: number;
  currentUserId: string;
  actingRole: Profile['role'];
  roleLabels: Record<string, string>;
  nameOf: (desc: string) => string;
  onClose: () => void;
}) {
  const S = useSc();
  const dept = deptOf(a.role);
  const overrides = Object.fromEntries(a.overrides.map((o) => [o.section, o.allow]));
  const visible = SECTION_LABEL.filter(([s]) => canSeeFor({ role: a.role, section_overrides: overrides }, s));
  const history = audit.filter((e) => e.description.includes(a.id)).slice(0, 12);
  const facts: [string, ReactNode][] = [
    [S.t('cPhone'), a.phone],
    [S.t('cEmail'), a.email || '—'],
    [S.t('fBirth'), S.fd(a.date_of_birth)],
    [S.t('cCreated'), S.fd(a.created_at)],
    [S.t('cLastSeen'), S.ago(a.last_seen_at, now)],
    ['Telegram', a.telegram_id ? S.t('connected') : S.t('notConnected')],
    [S.t('fPassword'), a.must_change_password ? S.t('pwTemp') : S.t('pwOwn')],
    [S.t('cStatus'), a.is_active ? S.t('stActive') : a.frozen_reason === 'star_balance' ? S.t('stFrozenLong') : S.t('stInactive')],
  ];

  return (
    <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto border-au-line bg-au-card p-0 text-au-ink sm:max-w-lg">
      <SheetHeader className="relative flex-row items-center gap-4 overflow-hidden border-b border-au-line px-5 py-5">
        <i className="absolute inset-x-0 top-0 h-1" style={{ background: DEPT_TONE[dept] }} />
        <Avatar a={a} size={60} />
        <div className="min-w-0">
          <SheetTitle className="truncate text-lg font-bold text-au-ink">{fullName(a)}</SheetTitle>
          <SheetDescription className="text-sm text-au-muted">
            {roleLabels[a.role] ?? a.role} · {S.dept[dept]}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link href={`/profile/${a.id}`} onClick={onClose} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')}>
              <UserRound className="size-3" /> {S.t('profile')}
            </Link>
            <Link href="/hr?tab=people" onClick={onClose} className={cn(CHIP_NEUTRAL, 'hover:text-au-ink')}>
              <Users className="size-3" /> HR
            </Link>
          </div>
        </div>
      </SheetHeader>

      <div className="flex flex-col gap-5 px-5 py-5">
        <div className="flex justify-end">
          <StaffRowActions target={a} currentUserId={currentUserId} actingRole={actingRole} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {facts.map(([k, v], i) => (
            <div key={k} className="ms-rise min-w-0" style={{ ['--i' as string]: i }}>
              <dt className="text-[11px] font-semibold tracking-wide text-au-faint uppercase">{k}</dt>
              <dd className="truncate text-sm text-au-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <section>
          <h3 className={cn(CARD_TITLE, 'mb-2')}>{S.t('positions')}</h3>
          <div className="flex flex-wrap gap-1.5">
            <span className={CHIP_INFO}>{S.t('main', { r: roleLabels[a.role] ?? a.role })}</span>
            {a.positions.map((p) => (
              <span key={p} className={CHIP_NEUTRAL}>
                {roleLabels[p] ?? p}
              </span>
            ))}
            {a.market_editor && (
              <span className={CHIP_ACCENT}>
                <Store className="size-3" /> {S.t('marketEditor')}
              </span>
            )}
          </div>
        </section>

        <section>
          <h3 className={cn(CARD_TITLE, 'mb-2')}>
            {S.t('visibleSecs')} <span className="text-xs font-medium text-au-faint">({visible.length})</span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {visible.map(([s]) => (
              <span key={s} className={s in overrides ? CHIP_ACCENT : CHIP_NEUTRAL} title={s in overrides ? S.t('personal') : S.t('byRole')}>
                {S.sec[s]}
              </span>
            ))}
          </div>
          {a.overrides.some((o) => !o.allow) && (
            <p className="mt-2 text-xs text-au-muted">
              {S.t('closed')}{' '}
              {a.overrides
                .filter((o) => !o.allow)
                .map((o) => S.sec[o.section] ?? o.section)
                .join(', ')}
            </p>
          )}
        </section>

        <section>
          <h3 className={cn(CARD_TITLE, 'mb-2')}>{S.t('history')}</h3>
          {history.length === 0 ? (
            <p className="text-sm text-au-faint">{S.t('noHistory')}</p>
          ) : (
            <ol className="relative flex flex-col gap-3 border-l border-au-line pl-4">
              {history.map((e, i) => (
                <li key={e.id} className="ms-rise relative" style={{ ['--i' as string]: i }}>
                  <i className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-au-card bg-au-accent" />
                  <p className="text-sm font-semibold text-au-ink">{S.au(e.type)}</p>
                  <p className="text-xs text-au-muted">
                    {S.fdt(e.at)} · {e.actor ?? S.t('system')}
                  </p>
                  {e.type === 'staff.update' && e.description.includes('role') && <p className="text-xs text-au-faint">{nameOf(e.description)}</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </SheetContent>
  );
}

/* ------------------------------------------------------------ access */

function Access({ accounts, roleLabels }: { accounts: ConsoleAccount[]; roleLabels: Record<string, string> }) {
  const S = useSc();
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const [person, setPerson] = useState('');
  const p = accounts.find((a) => a.id === person) ?? null;
  const pOverrides = p ? Object.fromEntries(p.overrides.map((o) => [o.section, o.allow])) : {};
  const holders = (r: Role) => accounts.filter((a) => a.is_active && (a.role === r || a.positions.includes(r))).length;
  const withOverrides = accounts.filter((a) => a.overrides.length > 0);
  const multi = accounts.filter((a) => a.is_active && a.positions.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(SURFACE_CARD, 'p-4 sm:p-5')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className={CARD_TITLE}>{S.t('matrix')}</h2>
            <p className="text-xs text-au-muted">{S.t('matrixSub')}</p>
          </div>
          <select value={person} onChange={(e) => setPerson(e.target.value)} className={cn(INPUT, 'h-10 w-auto max-w-[260px]')} aria-label={S.t('byPerson')}>
            <option value="">{S.t('checkPerson')}</option>
            {accounts
              .filter((a) => a.is_active)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {fullName(a)}
                </option>
              ))}
          </select>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" onMouseLeave={() => setHover(null)}>
          <table className="border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-au-card" />
                {ROLES.map((r, c) => (
                  <th
                    key={r}
                    className={cn('h-36 min-w-8 px-0.5 align-bottom font-semibold transition-colors', hover?.c === c ? 'text-au-ink' : 'text-au-muted', p && (p.role === r ? 'text-au-accent-text' : 'opacity-40'))}
                  >
                    <span className="inline-block [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                      {roleLabels[r]} <span className="text-au-faint">· {holders(r)}</span>
                    </span>
                  </th>
                ))}
                {p && <th className="min-w-20 px-2 align-bottom text-left font-bold text-au-accent-text">{p.first_name}</th>}
              </tr>
            </thead>
            <tbody>
              {SECTION_LABEL.map(([s], ri) => {
                const n = S.sec[s];
                const pVal = p ? canSeeFor({ role: p.role, section_overrides: pOverrides }, s) : false;
                return (
                  <tr key={s}>
                    <th
                      scope="row"
                      className={cn('sticky left-0 z-10 bg-au-card py-1.5 pr-3 text-left font-semibold whitespace-nowrap transition-colors', hover?.r === ri ? 'text-au-ink' : 'text-au-muted')}
                    >
                      {n}
                    </th>
                    {ROLES.map((r, c) => {
                      const on = (SECTION_ROLES[s] as readonly string[]).includes(r);
                      const lit = hover && (hover.r === ri || hover.c === c);
                      return (
                        <td key={r} onMouseEnter={() => setHover({ r: ri, c })} className={cn('h-7 text-center transition-colors', lit && 'bg-au-card-2', p && p.role !== r && 'opacity-30')}>
                          <span
                            className={cn('ms-wave inline-block size-3 rounded-[4px]', on ? 'bg-au-ink' : 'border border-au-line')}
                            style={{ ['--i' as string]: Math.min(ri + c, 30) }}
                            title={`${roleLabels[r]} — ${n}: ${on ? S.t('sees') : S.t('no')}`}
                          />
                        </td>
                      );
                    })}
                    {p && (
                      <td className="px-2">
                        <span className={cn(pVal ? CHIP_OK : CHIP_NEUTRAL, 'h-5 text-[10px]', s in pOverrides && 'ring-1 ring-au-accent')}>
                          {pVal ? S.t('yes') : S.t('no')}
                          {s in pOverrides && S.t('personalShort')}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(SURFACE_CARD, 'p-4 sm:p-5')}>
          <h2 className={cn(CARD_TITLE, 'mb-3')}>{S.t('personalAccess')}</h2>
          {withOverrides.length === 0 ? (
            <p className="text-sm text-au-faint">{S.t('noExceptions')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-au-line">
              {withOverrides.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Avatar a={a} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fullName(a)}</span>
                  {a.overrides.map((o) => (
                    <span key={o.section} className={o.allow ? CHIP_OK : CHIP_BAD}>
                      {o.allow ? '+' : '−'} {S.sec[o.section] ?? o.section}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <Link href="/platform" className="mt-3 inline-block text-xs font-semibold text-au-accent-text">
            {S.t('changeInPlatform')}
          </Link>
        </div>
        <div className={cn(SURFACE_CARD, 'p-4 sm:p-5')}>
          <h2 className={cn(CARD_TITLE, 'mb-3')}>{S.t('multi')}</h2>
          {multi.length === 0 ? (
            <p className="text-sm text-au-faint">{S.t('allSingle')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-au-line">
              {multi.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Avatar a={a} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fullName(a)}</span>
                  <span className={CHIP_INFO}>{roleLabels[a.role]}</span>
                  {a.positions.map((r) => (
                    <span key={r} className={CHIP_NEUTRAL}>
                      {roleLabels[r] ?? r}
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          )}
          <Link href="/roles" className="mt-3 inline-block text-xs font-semibold text-au-accent-text">
            {S.t('manageRoles')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ security */

type Finding = { key: string; title: string; why: string; weight: number; people: ConsoleAccount[]; fix?: 'reset' | 'telegram' };

function SecurityRing({ score }: { score: number }) {
  const S = useSc();
  const tone = score >= 85 ? 'var(--au-ok)' : score >= 60 ? 'var(--au-accent)' : 'var(--au-bad)';
  return (
    <svg viewBox="0 0 120 120" className="size-32" role="img" aria-label={S.t('secScore', { n: score })}>
      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--au-ring-track)" strokeWidth="11" />
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke={tone}
        strokeWidth="11"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${score / 100} 1`}
        transform="rotate(-90 60 60)"
        className="ms-arc"
      />
      <text x="60" y="58" textAnchor="middle" className="fill-au-ink text-[30px] font-bold">
        {score}
      </text>
      <text x="60" y="78" textAnchor="middle" className="fill-au-muted text-[11px]">
        / 100
      </text>
    </svg>
  );
}

function Security({ accounts, now, roleLabels, onOpen }: { accounts: ConsoleAccount[]; now: number; roleLabels: Record<string, string>; onOpen: (id: string) => void }) {
  const S = useSc();
  const [fix, setFix] = useState<{ kind: 'reset' | 'telegram'; id: string } | null>(null);
  const active = accounts.filter((a) => a.is_active);
  const findings: Finding[] = [
    {
      key: 'never',
      title: S.t('fNever'),
      why: S.t('fNeverWhy'),
      weight: 6,
      people: active.filter((a) => neverSignedIn(a, now)),
      fix: 'reset',
    },
    {
      key: 'stale',
      title: S.t('fStale', { n: STALE_DAYS }),
      why: S.t('fStaleWhy'),
      weight: 4,
      people: active.filter((a) => isStale(a, now)),
    },
    {
      key: 'tgInactive',
      title: S.t('fTgInactive'),
      why: S.t('fTgInactiveWhy'),
      weight: 5,
      people: accounts.filter((a) => !a.is_active && !!a.telegram_id),
      fix: 'telegram',
    },
    {
      key: 'noTg',
      title: S.t('fNoTg'),
      why: S.t('fNoTgWhy'),
      weight: 1,
      people: active.filter((a) => !a.telegram_id),
    },
    {
      key: 'protected',
      title: S.t('fProtected'),
      why: S.t('fProtectedWhy'),
      weight: 0,
      people: active.filter((a) => isProtectedRole(a.role) || a.positions.some(isProtectedRole)),
    },
  ];
  const penalty = findings.reduce((s, f) => s + f.weight * f.people.length, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 - (penalty / Math.max(1, active.length)) * 10)));
  const target = fix ? accounts.find((a) => a.id === fix.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(SURFACE_CARD, 'flex flex-wrap items-center gap-6 p-5')}>
        <SecurityRing score={score} />
        <div className="min-w-[220px] flex-1">
          <h2 className="text-lg font-bold text-au-ink">{S.t('secTitle')}</h2>
          <p className="mt-1 text-sm text-au-muted">
            {score >= 85 ? S.t('secGood') : score >= 60 ? S.t('secMid') : S.t('secBad')}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {findings
              .filter((f) => f.weight > 0)
              .map((f) => (
                <a key={f.key} href={`#sec-${f.key}`} className={f.people.length ? (f.weight >= 4 ? CHIP_BAD : CHIP_ACCENT) : CHIP_OK}>
                  {f.people.length ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
                  {f.title} · {f.people.length}
                </a>
              ))}
          </div>
        </div>
      </div>

      {findings.map((f, fi) => (
        <section key={f.key} id={`sec-${f.key}`} className={cn(SURFACE_CARD, 'ms-rise scroll-mt-24 p-4 sm:p-5')} style={{ ['--i' as string]: fi }}>
          <div className="flex items-start gap-3">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-full', f.people.length === 0 ? 'bg-au-ok-soft text-au-ok' : f.weight >= 4 ? 'bg-au-bad-soft text-au-bad' : 'bg-au-accent-soft text-au-accent-text')}>
              {f.people.length === 0 ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={CARD_TITLE}>
                {f.title} <span className="font-medium text-au-faint">· {f.people.length}</span>
              </h3>
              <p className="text-xs text-au-muted">{f.why}</p>
            </div>
          </div>
          {f.people.length > 0 && (
            <ul className="mt-3 flex flex-col divide-y divide-au-line">
              {f.people.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Avatar a={a} size={30} />
                  <button type="button" onClick={() => onOpen(a.id)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold hover:underline">
                    {fullName(a)} <span className="font-normal text-au-muted">· {roleLabels[a.role] ?? a.role}</span>
                  </button>
                  <span className="text-xs text-au-faint">{f.key === 'never' ? S.t('opened', { d: S.fd(a.created_at) }) : S.ago(a.last_seen_at, now)}</span>
                  {f.fix === 'reset' && (
                    <button type="button" onClick={() => setFix({ kind: 'reset', id: a.id })} className={cn(CHIP_ACCENT, 'h-7 px-2.5')}>
                      <KeyRound className="size-3" /> {S.t('newPw')}
                    </button>
                  )}
                  {f.fix === 'telegram' && (
                    <button type="button" onClick={() => setFix({ kind: 'telegram', id: a.id })} className={cn(CHIP_BAD, 'h-7 px-2.5')}>
                      <Send className="size-3" /> {S.t('disconnect')}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {target && fix?.kind === 'reset' && <ResetPasswordDialog staffId={target.id} open onOpenChange={(o) => !o && setFix(null)} />}
      {target && fix?.kind === 'telegram' && <DisconnectStaffTelegramButton staffId={target.id} open onOpenChange={(o) => !o && setFix(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ audit */

function Audit({ audit, nameOf, onOpen, idsIn }: { audit: AuditEntry[]; nameOf: (s: string) => string; onOpen: (id: string) => void; idsIn: (s: string) => string[] }) {
  const S = useSc();
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const rows = audit.filter((e) => (!type || e.type === type) && (!needle || `${nameOf(e.description)} ${e.actor ?? ''}`.toLowerCase().includes(needle)));
  const days: [string, AuditEntry[]][] = [];
  for (const e of rows) {
    const k = dayKey(e.at);
    const last = days[days.length - 1];
    if (last?.[0] === k) last[1].push(e);
    else days.push([k, [e]]);
  }
  const present = [...new Set(audit.map((e) => e.type))];

  return (
    <div className="flex flex-col gap-4">
      <div className={cn(SURFACE_CARD, 'flex flex-wrap items-center gap-2 p-3 sm:p-4')}>
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-au-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={S.t('auditPh')} className={cn(INPUT, 'h-10 pl-9')} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setType('')} className={cn(type ? CHIP_NEUTRAL : CHIP_INFO, 'h-8 px-3')}>
            {S.t('all', { n: audit.length })}
          </button>
          {present.map((t) => (
            <button key={t} type="button" onClick={() => setType(type === t ? '' : t)} className={cn(type === t ? CHIP_INFO : CHIP_NEUTRAL, 'h-8 px-3')}>
              {S.au(t)} · {audit.filter((e) => e.type === t).length}
            </button>
          ))}
        </div>
      </div>

      {days.length === 0 ? (
        <div className={cn(SURFACE_CARD, 'grid place-items-center gap-2 py-14 text-center')}>
          <Clock3 className="size-8 text-au-faint" />
          <p className="text-sm font-semibold">{S.t('emptyLog')}</p>
          <p className="max-w-sm text-xs text-au-muted">{S.t('emptyLogSub')}</p>
        </div>
      ) : (
        days.map(([day, list], di) => (
          <section key={day} className={cn(SURFACE_CARD, 'ms-rise p-4 sm:p-5')} style={{ ['--i' as string]: Math.min(di, 8) }}>
            <h3 className="mb-3 text-xs font-bold tracking-wide text-au-muted uppercase">{S.fd(list[0].at)}</h3>
            <ol className="flex flex-col divide-y divide-au-line">
              {list.map((e) => {
                const meta = AUDIT_LABEL[e.type] ?? { n: e.type, tone: CHIP_NEUTRAL };
                const target = idsIn(e.description)[0];
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="w-12 shrink-0 text-xs text-au-faint tabular-nums">
                      {new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', hourCycle: 'h23', minute: '2-digit' }).format(new Date(e.at))}
                    </span>
                    <span className={meta.tone}>{S.au(e.type)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-au-ink">{nameOf(e.description)}</span>
                    <span className="text-xs text-au-muted">{e.actor ?? S.t('system')}</span>
                    {target && (
                      <button type="button" onClick={() => onOpen(target)} className="text-xs font-semibold text-au-accent-text">
                        {S.t('open')}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------ shell */

export function StaffConsole({ tab, accounts, audit, now, currentUserId, actingRole, roleLabels }: {
  tab: ConsoleTab;
  accounts: ConsoleAccount[];
  audit: AuditEntry[];
  now: number;
  currentUserId: string;
  actingRole: Profile['role'];
  roleLabels: Record<string, string>;
}) {
  const S = useSc();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = accounts.find((a) => a.id === openId) ?? null;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const idsIn = (s: string) => [...s.matchAll(UUID)].map((m) => m[0].toLowerCase()).filter((id) => byId.has(id));
  /** Audit descriptions carry raw ids — show the person's name instead. */
  const nameOf = (s: string) =>
    s
      .replace(UUID, (id) => {
        const a = byId.get(id.toLowerCase());
        return a ? fullName(a) : S.t('deletedStaff');
      })
      .replace(/^(Updated|Reset password of|Disconnected Telegram of|Deactivated staff member|Reactivated staff member|Created staff member|Deleted staff member)\s*/i, '')
      .replace(/\brole\b/, S.t('roleWord'))
      .replace(/\(bulk\)/, S.t('bulk'))
      .replace(/\b([a-z_]+)(?= →| ✕|=)/g, (r) => roleLabels[r] ?? S.sec[r] ?? r)
      .replace(/→ ([a-z_]+)\b/g, (_m, r: string) => `→ ${roleLabels[r] ?? r}`);

  return (
    <>
      {tab === 'accounts' && (
        <Accounts accounts={accounts} audit={audit} now={now} currentUserId={currentUserId} actingRole={actingRole} roleLabels={roleLabels} onOpen={setOpenId} />
      )}
      {tab === 'access' && <Access accounts={accounts} roleLabels={roleLabels} />}
      {tab === 'security' && <Security accounts={accounts} now={now} roleLabels={roleLabels} onOpen={setOpenId} />}
      {tab === 'audit' && <Audit audit={audit} nameOf={nameOf} onOpen={setOpenId} idsIn={idsIn} />}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpenId(null)}>
        {open && (
          <AccountDrawer
            a={open}
            audit={audit}
            now={now}
            currentUserId={currentUserId}
            actingRole={actingRole}
            roleLabels={roleLabels}
            nameOf={nameOf}
            onClose={() => setOpenId(null)}
          />
        )}
      </Sheet>
    </>
  );
}
