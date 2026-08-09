import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { AssignMissionDialog } from '@/components/missions/assign-mission-dialog';
import { MissionsList, type MissionItem } from '@/components/missions/missions-list';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const t = await getTranslations('missions');
  const { user, profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'it_developer';
  const supabase = await createClient();

  if (isAdmin) {
    const [{ data: staff }, { data: missions }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('is_active', true)
        .order('first_name', { ascending: true }),
      supabase.from('missions').select('*').order('created_at', { ascending: false }),
    ]);

    const missionsByStaffId = new Map<string, MissionItem[]>();
    for (const m of missions ?? []) {
      const list = missionsByStaffId.get(m.staff_id) ?? [];
      list.push(m);
      missionsByStaffId.set(m.staff_id, list);
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
          {(staff ?? []).map((person, index) => {
            const personMissions = missionsByStaffId.get(person.id) ?? [];
            const activeCount = personMissions.filter((m) => !m.is_completed).length;
            return (
              <div
                key={person.id}
                style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
                className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-4 p-6')}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold text-white">
                    {person.first_name} {person.last_name}
                  </span>
                  <span className="text-sm text-white/60">{t('activeCount', { count: activeCount })}</span>
                </div>
                <AssignMissionDialog staffId={person.id} />
                <MissionsList missions={personMissions} currentUserId={user!.id} isAdmin />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('staff_id', user!.id)
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>

      <MissionsList missions={(missions ?? []) as MissionItem[]} currentUserId={user!.id} isAdmin={false} />
    </div>
  );
}
