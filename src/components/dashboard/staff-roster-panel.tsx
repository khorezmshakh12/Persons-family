import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const ROSTER_LIMIT = 6;

const ROLE_TINT: Record<string, string> = {
  ceo: 'bg-purple-500/25 text-purple-100',
  admin_manager: 'bg-blue-500/25 text-blue-100',
  teacher: 'bg-green-500/25 text-green-100',
  assistant: 'bg-orange-500/25 text-orange-100',
  smm: 'bg-pink-500/25 text-pink-100',
  mobilgrof: 'bg-yellow-500/25 text-yellow-100',
  it_developer: 'bg-cyan-500/25 text-cyan-100',
};

export async function StaffRosterPanel() {
  const t = await getTranslations('dashboard.staffPanel');
  const tStaff = await getTranslations('staff');
  const supabase = await createClient();

  const { data } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, role, is_active')
    .order('created_at', { ascending: false })
    .limit(ROSTER_LIMIT);

  const staff = data ?? [];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <Link
          href="/staff"
          className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
        >
          {t('viewAll')}
        </Link>
      </div>

      {staff.length === 0 ? (
        <p className="text-sm text-white/70">{t('noStaff')}</p>
      ) : (
        <div className="flex flex-col">
          {staff.map((person) => (
            <Link
              key={person.id}
              href="/staff"
              className={cn(
                'flex items-center gap-3 rounded-lg border-b border-white/10 px-2 py-3 last:border-b-0',
                GLASS_INTERACTIVE,
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="border border-white/30">
                  <AvatarImage src={person.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-white/10 text-white">
                    {person.first_name[0]}
                    {person.last_name[0]}
                  </AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-black/20',
                    person.is_active ? 'bg-emerald-400' : 'bg-white/30',
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {person.first_name} {person.last_name}
                </p>
                <p className="truncate text-xs text-white/60">
                  {person.is_active ? t('active') : t('inactive')}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium',
                  ROLE_TINT[person.role] ?? 'bg-white/15 text-white/90',
                )}
              >
                {tStaff(`roles.${person.role}`)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
