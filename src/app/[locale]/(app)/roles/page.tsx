import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { canAssignRoles } from '@/lib/permissions';
import { RolesManager, type RolePerson } from '@/components/roles/roles-manager';

export const dynamic = 'force-dynamic';

/** Lavozimlar — CEO / COO give people (themselves included) extra positions. */
export default async function RolesPage() {
  const { user, profile } = await getAuthState();
  const locale = await getLocale();
  if (!profile) redirect({ href: { pathname: '/login', query: { reason: 'session' } }, locale });
  if (!canAssignRoles(profile!.roles)) redirect({ href: '/dashboard', locale });
  const t = await getTranslations('rolesPage');
  const people = await sql<RolePerson[]>`
    select p.id, p.first_name, p.last_name, p.role::text as primary_role,
           array(select r.role::text from profile_roles r where r.user_id = p.id order by r.granted_at) as extra
    from profiles p
    where p.is_active
    order by p.first_name, p.last_name
  `;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <div className="rounded-au-card bg-au-hero px-6 py-6">
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">{t('title')}</h1>
        <p className="mt-1 text-sm text-au-muted">{t('subtitle')}</p>
      </div>
      <RolesManager people={[...people]} actorId={user!.id} actorRoles={profile!.roles ?? [profile!.role]} />
    </div>
  );
}
