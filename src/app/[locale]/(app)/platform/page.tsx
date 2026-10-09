import { getLocale, getTranslations } from 'next-intl/server';
import { HealthPanel, JournalPanel, QualityPanel } from '@/components/platform/platform-ops';
import { loadDataQuality, loadHealth, loadJournal } from '@/lib/platform-health';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canAssignRoles, canSeeFor } from '@/lib/permissions';
import { loadTelegramCenter } from '@/lib/telegram-center';
import { TelegramPanel } from '@/components/platform/telegram-panel';
import { tashkentMonthKey } from '@/lib/time';
import { RolesManager, type RolePerson } from '@/components/roles/roles-manager';
import { SectionAccess } from '@/components/platform/section-access';
import { SalesTargets, type TargetRow } from '@/components/platform/sales-targets';
import { PlatformTabs } from '@/components/platform/platform-tabs';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

const TABS = ['roles', 'access', 'targets', 'health', 'quality', 'journal', 'telegram'] as const;

/** Platforma sozlamalari — CEO / COO: positions, per-person section access,
 * monthly sales targets. */
export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  // Leadership sees every tab; whoever holds the Telegram section (the IT
  // developer) sees just the Telegram centre that replaced /telegram-setup.
  const lead = canAssignRoles(profile!.roles);
  const tg = canSeeFor(profile!, 'telegramSetup');
  if (!lead && !tg) redirect({ href: '/dashboard', locale });
  const t = await getTranslations('platform');
  const q = (await searchParams).tab;
  const tab = !lead ? 'telegram' : (TABS as readonly string[]).includes(q ?? '') ? (q as (typeof TABS)[number]) : 'roles';

  const people = await sql<RolePerson[]>`
    select p.id, p.first_name, p.last_name, p.role::text as primary_role,
           array(select r.role::text from profile_roles r where r.user_id = p.id order by r.granted_at) as extra
    from profiles p where p.is_active order by p.first_name, p.last_name
  `;
  const held = profile!.roles ?? [profile!.role];

  let body: React.ReactNode;
  if (tab === 'telegram') {
    body = <TelegramPanel data={await loadTelegramCenter()} canWebhook={tg} />;
  } else if (tab === 'roles') {
    body = <RolesManager people={[...people]} actorId={user!.id} actorRoles={held} />;
  } else if (tab === 'access') {
    const rows = await sql<{ user_id: string; section: string; allow: boolean }[]>`select user_id, section, allow from section_access`;
    const overrides: Record<string, Record<string, boolean>> = {};
    for (const r of rows) (overrides[r.user_id] ??= {})[r.section] = r.allow;
    body = <SectionAccess people={[...people]} overrides={overrides} actorId={user!.id} actorIsCeo={held.includes('ceo')} />;
  } else if (tab === 'health') {
    body = <HealthPanel h={await loadHealth()} />;
  } else if (tab === 'quality') {
    body = <QualityPanel issues={await loadDataQuality()} />;
  } else if (tab === 'journal') {
    body = <JournalPanel rows={await loadJournal()} />;
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
      <PlatformTabs
        tab={tab}
        labels={
          lead
            ? {
                roles: t('tabs.roles'),
                access: t('tabs.access'),
                targets: t('tabs.targets'),
                health: 'Tizim holati',
                quality: 'Ma’lumot sifati',
                journal: 'Jurnal',
                ...(tg ? { telegram: 'Telegram' } : {}),
              }
            : { telegram: 'Telegram' }
        }
      />
      {body}
    </div>
  );
}
