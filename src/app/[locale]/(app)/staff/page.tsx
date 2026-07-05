import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { AddStaffDialog } from '@/components/staff/add-staff-dialog';
import { StaffTable } from '@/components/staff/staff-table';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const t = await getTranslations('staff');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });
  const { data: performance } = await supabase.from('staff_performance').select('*');
  const performanceByStaffId = Object.fromEntries((performance ?? []).map((row) => [row.staff_id, row]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <AddStaffDialog canAssignCeo={profile!.role === 'ceo'} />
      </div>
      <StaffTable
        staff={staff ?? []}
        currentUserId={user!.id}
        actingRole={profile!.role}
        performanceByStaffId={performanceByStaffId}
      />
    </div>
  );
}
