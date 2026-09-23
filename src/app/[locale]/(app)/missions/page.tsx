import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { MissionsDetailContent } from './[staffId]/page';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const t = await getTranslations('missions');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo';

  if (isAdmin) {
    const [staff, missions] = await Promise.all([
      sql<{ id: string; first_name: string; last_name: string; role: string }[]>`
        select id, first_name, last_name, role from profiles
        where is_active = true order by first_name asc
      `,
      sql<{ staff_id: string; status: string }[]>`select staff_id, status from missions`,
    ]);

    const activeCountByStaffId = new Map<string, number>();
    for (const m of missions) {
      if (m.status === 'approved' || m.status === 'rejected') continue;
      activeCountByStaffId.set(m.staff_id, (activeCountByStaffId.get(m.staff_id) ?? 0) + 1);
    }

    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-1 pb-8 sm:px-7">
        <div className="flex flex-col gap-1 relative overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
          <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">
            {t('title')}
          </h1>
          <p className="text-au-muted">{t('adminSubtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          {staff.map((person, index) => (
            <Link
              key={person.id}
              href={`/missions/${person.id}`}
              style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
              className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'animate-fade-in-up flex items-center justify-between gap-3 p-6')}
            >
              <span className="font-semibold text-au-ink">
                {person.first_name} {person.last_name}
              </span>
              <span className="text-sm text-au-muted">
                {t('activeCount', { count: activeCountByStaffId.get(person.id) ?? 0 })}
              </span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // Non-admin: their own missions render in place (used to redirect() to
  // /missions/[own-id] — see the comment on ProfileDetailContent in
  // profile/[id]/page.tsx for why that broke).
  return <MissionsDetailContent staffId={user!.id} />;
}
