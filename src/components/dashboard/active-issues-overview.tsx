import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const STATUS_BADGE: Record<string, string> = {
  open: 'border-white/20 bg-white/10 text-white',
  in_progress: 'border-amber-300/30 bg-amber-400/15 text-amber-200',
};

export async function ActiveIssuesOverview() {
  const t = await getTranslations('dashboard.activeIssues');
  const tIssues = await getTranslations('issues');
  const supabase = await createClient();

  const { data: issues } = await supabase
    .from('issues')
    .select('id, title, status, assignee:profiles!issues_assigned_to_fkey(first_name, last_name)')
    .neq('status', 'done')
    .order('created_at', { ascending: false })
    .limit(5);

  const rows = issues ?? [];

  return (
    <Link href="/issues" className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{t('title')}</h2>
        <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-white/70">{t('noActiveIssues')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((issue) => (
            <li
              key={issue.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="truncate text-sm text-white">{issue.title}</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  STATUS_BADGE[issue.status] ?? STATUS_BADGE.open,
                )}
              >
                {tIssues(`columns.${issue.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
