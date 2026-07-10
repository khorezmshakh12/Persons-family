'use server';

import { requireAdmin } from '@/lib/auth/require-admin';
import { createClient } from '@/lib/supabase/server';

export type SystemLogRow = {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
  user_id: string | null;
  author: { first_name: string; last_name: string } | null;
};

const PAGE_SIZE = 30;

export async function fetchSystemLogsPageAction(offset: number): Promise<SystemLogRow[]> {
  try {
    await requireAdmin();
  } catch {
    return [];
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('system_logs')
    .select('id, action_type, description, created_at, user_id, author:profiles!system_logs_user_id_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  return (data ?? []) as unknown as SystemLogRow[];
}
