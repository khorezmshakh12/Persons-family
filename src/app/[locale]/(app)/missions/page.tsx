import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { MissionsDetailContent } from './[staffId]/page';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const t = await getTranslations('missions');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo';
  const supabase = await createClient();

  if (isAdmin) {
    const [{ data: staff }, { data: missions }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('is_active', true)
        .order('first_name', { ascending: true }),
      supabase.from('missions').select('staff_id, status'),
    ]);

    const activeCountByStaffId = new Map<string, number>();
    for (const m of missions ?? []) {
      if (m.status === 'approved' || m.status === 'rejected') continue;
      activeCountByStaffId.set(m.staff_id, (activeCountByStaffId.get(m.staff_id) ?? 0) + 1);
    }

    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {t('title')}
          </h1>
          <p className="text-white/70">{t('adminSubtitle')}</p>
        </div>

        <div className="flex flex-col gap-4">
          {(staff ?? []).map((person, index) => (
            <Link
              key={person.id}
              href={`/missions/${person.id}`}
              style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
              className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'animate-fade-in-up flex items-center justify-between gap-3 p-6')}
            >
              <span className="font-semibold text-white">
                {person.first_name} {person.last_name}
              </span>
              <span className="text-sm text-white/60">
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
