import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

const RECENT_GROUPS_LIMIT = 6;

type RecentGroupRow = {
  id: string;
  name: string;
  teacher: { first_name: string; last_name: string } | null;
  assigned_ta: { first_name: string; last_name: string } | null;
};

export async function RecentGroupsPanel() {
  const t = await getTranslations('dashboard.groupsPanel');
  const { profile } = await getAuthState();
  const supabase = await createClient();

  let query = supabase
    .from('groups')
    .select(
      'id, name, teacher:profiles!groups_teacher_id_fkey(first_name, last_name), assigned_ta:profiles!groups_assigned_ta_id_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false })
    .limit(RECENT_GROUPS_LIMIT);

  if (profile!.role === 'teacher') query = query.eq('teacher_id', profile!.id);
  else if (profile!.role === 'assistant') query = query.eq('assigned_ta_id', profile!.id);

  const { data } = await query;
  const groups = (data as unknown as RecentGroupRow[]) ?? [];

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <Link
          href="/lesson-plans"
          className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:bg-white/20"
        >
          {t('viewAll')}
        </Link>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-white/70">{t('noGroups')}</p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[1fr_1fr_1fr] gap-2 border-b border-white/10 pb-2 text-xs font-medium text-white/50 sm:grid">
            <span>{t('groupName')}</span>
            <span>{t('teacher')}</span>
            <span>{t('ta')}</span>
          </div>
          {groups.map((group) => (
            <div
              key={group.id}
              className="grid grid-cols-1 gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid-cols-[1fr_1fr_1fr] sm:items-center sm:gap-2"
            >
              <span className="truncate font-medium text-white">{group.name}</span>
              <span className="truncate text-sm text-white/70">
                {group.teacher ? `${group.teacher.first_name} ${group.teacher.last_name}` : '—'}
              </span>
              <span className="truncate text-sm text-white/70">
                {group.assigned_ta ? `${group.assigned_ta.first_name} ${group.assigned_ta.last_name}` : t('noTa')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
