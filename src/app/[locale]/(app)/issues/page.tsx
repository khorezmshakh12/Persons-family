import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { CreateIssueDialog } from '@/components/issues/create-issue-dialog';
import { IssuesTable } from '@/components/issues/issues-table';

export const dynamic = 'force-dynamic';

export default async function IssuesPage() {
  const t = await getTranslations('issues');
  const { profile } = await getAuthState();
  const supabase = await createClient();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  const { data: issues } = await supabase
    .from('issues')
    .select(
      'id, title, description, status, created_at, reporter:profiles!issues_created_by_fkey(first_name, last_name)',
    )
    .order('created_at', { ascending: false });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <CreateIssueDialog />
      </div>
      <IssuesTable issues={(issues as never) ?? []} isAdmin={isAdmin} />
    </div>
  );
}
