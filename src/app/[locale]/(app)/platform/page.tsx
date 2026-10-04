import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canAssignRoles } from '@/lib/permissions';
import { tashkentMonthKey } from '@/lib/time';
import { RolesManager, type RolePerson } from '@/components/roles/roles-manager';
import { SectionAccess } from '@/components/platform/section-access';
import { SalesTargets, type TargetRow } from '@/components/platform/sales-targets';
import { PlatformTabs } from '@/components/platform/platform-tabs';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

const TABS = ['roles', 'access', 'targets'] as const;

/** Platforma sozlamalari — CEO / COO: positions, per-person section access,
 * monthly sales targets. */
export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  if (!canAssignRoles(profile!.roles)) redirect({ href: '/dashboard', locale });
  const t = await getTranslations('platform');
  const q = (await searchParams).tab;
  const tab = (TABS as readonly string[]).includes(q ?? '') ? (q as (typeof TABS)[number]) : 'roles';

  const people = await sql<RolePerson[]>`
    select p.id, p.first_name, p.last_name, p.role::text as primary_role,
           array(select r.role::text from profile_roles r where r.user_id = p.id order by r.granted_at) as extra
    from profiles p where p.is_active order by p.first_name, p.last_name
  `;
  const held = profile!.roles ?? [profile!.role];

  let body: React.ReactNode;
  if (tab === 'roles') {
    body = <RolesManager people={[...people]} actorId={user!.id} actorRoles={held} />;
  } else if (tab === 'access') {
    const rows = await sql<{ user_id: string; section: string; allow: boolean }[]>`select user_id, section, allow from section_access`;
    const overrides: Record<string, Record<string, boolean>> = {};
    for (const r of rows) (overrides[r.user_id] ??= {})[r.section] = r.allow;
    body = <SectionAccess people={[...people]} overrides={overrides} actorId={user!.id} actorIsCeo={held.includes('ceo')} />;
  } else {
    const [row] = await sql<{ tgt: Record<string, { leads?: number; won?: number }> | null }[]>`select data->'tgt' as tgt from core_state where id = 1`;
    const now = tashkentMonthKey();
    const [y, m] = now.split('-').map(Number);
    const months = [-1, 0, 1, 2].map((d) => {
      const dt = new Date(Date.UTC(y, m - 1 + d, 1));
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    const targets: TargetRow[] = months.map((mk) => ({ month: mk, leads: row?.tgt?.[mk]?.leads ?? 0, won: row?.tgt?.[mk]?.won ?? 0, current: mk === now }));
    body = <SalesTargets rows={targets} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <div className="rounded-au-card bg-au-hero px-6 py-6">
        <BgVideo variant="hero" />
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-au-muted">{t('subtitle')}</p>
      </div>
      <PlatformTabs tab={tab} labels={{ roles: t('tabs.roles'), access: t('tabs.access'), targets: t('tabs.targets') }} />
      {body}
    </div>
  );
}
