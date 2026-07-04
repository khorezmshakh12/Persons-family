import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ClockCard } from '@/components/attendance/clock-card';
import { MyAttendanceHistory } from '@/components/attendance/my-attendance-history';
import { AllStaffAttendance } from '@/components/attendance/all-staff-attendance';

export const dynamic = 'force-dynamic';

function getTashkentWorkDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(date);
}

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string }>;
}) {
  const t = await getTranslations('attendance');
  const { user, profile } = await getAuthState();
  const supabase = await createClient();
  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';
  const workDate = getTashkentWorkDate();

  const { data: openSession } = await supabase
    .from('attendance')
    .select('id, clock_in')
    .eq('user_id', user!.id)
    .eq('work_date', workDate)
    .is('clock_out', null)
    .maybeSingle();

  const { data: myRecords } = await supabase
    .from('attendance')
    .select('id, work_date, clock_in, clock_out')
    .eq('user_id', user!.id)
    .order('work_date', { ascending: false })
    .limit(14);

  type AllStaffRecord = {
    id: string;
    work_date: string;
    clock_in: string;
    clock_out: string | null;
    profiles: { first_name: string; last_name: string } | null;
  };

  let staffList: { id: string; first_name: string; last_name: string }[] = [];
  let allRecords: AllStaffRecord[] = [];

  if (isAdmin) {
    const { staff: staffFilter } = await searchParams;

    const { data: staff } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name', { ascending: true });
    staffList = staff ?? [];

    let query = supabase
      .from('attendance')
      .select('id, work_date, clock_in, clock_out, profiles(first_name, last_name)')
      .order('work_date', { ascending: false })
      .order('clock_in', { ascending: false })
      .limit(100);

    if (staffFilter) query = query.eq('user_id', staffFilter);

    const { data: records } = await query;
    allRecords = (records as unknown as AllStaffRecord[]) ?? [];
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <ClockCard openSession={openSession ? { clockIn: openSession.clock_in } : null} />
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">{t('myHistory')}</h2>
          <MyAttendanceHistory records={myRecords ?? []} />
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-medium">{t('allStaff')}</h2>
          <AllStaffAttendance records={allRecords} staffList={staffList} />
        </div>
      )}
    </div>
  );
}
