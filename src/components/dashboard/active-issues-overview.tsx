import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { GLASS_CARD, GLASS_INTERACTIVE } from '@/lib/glass';
import { cn } from '@/lib/utils';

const STATUS_TINT: Record<string, 'slate' | 'amber'> = {
  open: 'slate',
  in_progress: 'amber',
};

export async function ActiveIssuesOverview({ delayMs = 0 }: { delayMs?: number } = {}) {
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
    <Link
      href="/issues"
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(GLASS_CARD, GLASS_INTERACTIVE, 'animate-fade-in-up flex flex-col gap-4 p-6')}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">
          {t('title')}
        </h2>
        <Badge variant="tint" tint="slate" className="text-xs font-semibold">
          {rows.length}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-white/70">{t('noActiveIssues')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((issue, i) => (
            <li
              key={issue.id}
              style={{ animationDelay: `${delayMs + 120 + i * 50}ms` }}
              className="animate-fade-in-up flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
            >
              <span className="truncate text-sm text-white">{issue.title}</span>
              <Badge variant="tint" tint={STATUS_TINT[issue.status] ?? 'slate'} className="shrink-0 text-[11px]">
                {tIssues(`columns.${issue.status}`)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
