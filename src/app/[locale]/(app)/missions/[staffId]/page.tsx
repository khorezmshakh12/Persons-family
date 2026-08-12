import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AssignMissionDialog } from '@/components/missions/assign-mission-dialog';
import { MissionCard, type MissionItem } from '@/components/missions/mission-card';
import { isShortTerm } from '@/lib/missions';

export const dynamic = 'force-dynamic';

// Exported so /missions/page.tsx can render a non-admin viewer's own
// missions page in place instead of redirect()-ing here — see the matching
// comment on ProfileDetailContent (profile/[id]/page.tsx) for why that
// redirect was crashing the client router under Next 16.
export async function MissionsDetailContent({ staffId }: { staffId: string }) {
  const t = await getTranslations('missions');
  const tStaff = await getTranslations('staff');
  const locale = await getLocale();
  const { user, profile } = await getAuthState();

  const isSelf = user!.id === staffId;
  const isCeo = profile!.role === 'ceo';
  const isAdmin = isCeo;
  if (!isSelf && !isAdmin) redirect({ href: '/dashboard', locale });

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, role')
    .eq('id', staffId)
    .maybeSingle();
  if (!target) notFound();

  const { data: missions } = await supabase
    .from('missions')
    .select('*')
    .eq('staff_id', staffId)
    .order('deadline_date', { ascending: true });

  const all = (missions ?? []) as MissionItem[];
  const shortTerm = all.filter((m) => isShortTerm(m.deadline_date));
  const longTerm = all.filter((m) => !isShortTerm(m.deadline_date));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div
        style={{ animationDelay: '0ms' }}
        className={cn(GLASS_CARD, 'animate-fade-in-up flex items-center gap-4 p-6')}
      >
        <Avatar className="size-16 border border-white/30">
          <AvatarImage src={target.avatar_url ?? undefined} alt="" />
          <AvatarFallback className="text-lg">
            {target.first_name[0]}
            {target.last_name[0]}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight font-heading text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
            {target.first_name} {target.last_name}
          </h1>
          <span className="text-sm text-white/60">{tStaff(`roles.${target.role}`)}</span>
        </div>
      </div>

      {isCeo && (
        <div style={{ animationDelay: '50ms' }} className="animate-fade-in-up">
          <AssignMissionDialog staffId={staffId} />
        </div>
      )}

      <div style={{ animationDelay: '100ms' }} className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-3 p-6')}>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('shortTerm')}
        </h2>
        {shortTerm.length === 0 ? (
          <p className="text-sm text-white/60">{t('noShortTerm')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {shortTerm.map((m) => (
              <MissionCard key={m.id} mission={m} currentUserId={user!.id} isCeo={isCeo} />
            ))}
          </div>
        )}
      </div>

      <div style={{ animationDelay: '170ms' }} className={cn(GLASS_CARD, 'animate-fade-in-up flex flex-col gap-3 p-6')}>
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('longTerm')}
        </h2>
        {longTerm.length === 0 ? (
          <p className="text-sm text-white/60">{t('noLongTerm')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {longTerm.map((m) => (
              <MissionCard key={m.id} mission={m} currentUserId={user!.id} isCeo={isCeo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default async function StaffMissionsPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  return <MissionsDetailContent staffId={staffId} />;
}
