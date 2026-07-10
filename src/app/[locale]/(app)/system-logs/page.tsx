import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { SystemLogsList } from '@/components/system-logs/system-logs-list';
import type { SystemLogRow } from '@/lib/actions/system-logs';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export default async function SystemLogsPage() {
  const { profile } = await getAuthState();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  if (!isAdmin) notFound();

  const t = await getTranslations('systemLogs');
  const supabase = await createClient();
  const { data } = await supabase
    .from('system_logs')
    .select('id, action_type, description, created_at, user_id, author:profiles!system_logs_user_id_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .range(0, PAGE_SIZE - 1);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
          {t('title')}
        </h1>
        <p className="text-white/70">{t('subtitle')}</p>
      </div>
      <SystemLogsList initialLogs={(data ?? []) as unknown as SystemLogRow[]} />
    </div>
  );
}
