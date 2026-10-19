import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor, can, ROLES } from '@/lib/permissions';
import { loadChecklist } from '@/lib/checklist-data';
import { ChecklistPage } from '@/components/checklist/checklist-page';

export const dynamic = 'force-dynamic';

export default async function TaskTrackerPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; manage?: string }>;
}) {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'taskTracker')) notFound();

  const canManage = can(profile.role, 'checklist.manage');
  const sp = await searchParams;
  const requested = canManage && sp.role && (ROLES as readonly string[]).includes(sp.role) ? sp.role : null;
  const effectiveRole = requested ?? profile.role;
  const managing = canManage && sp.manage === '1';

  const [data, tRoles] = await Promise.all([loadChecklist(profile.id, effectiveRole), getTranslations('roles')]);

  const roleLabelOf = (r: string) => ((ROLES as readonly string[]).includes(r) ? tRoles(r) : r);
  const roles = canManage ? ROLES.map((r) => ({ value: r, label: roleLabelOf(r) })) : [];

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
      <ChecklistPage
        data={data}
        role={effectiveRole}
        roleLabel={roleLabelOf(effectiveRole)}
        canManage={canManage}
        managing={managing}
        roles={roles}
      />
    </div>
  );
}
