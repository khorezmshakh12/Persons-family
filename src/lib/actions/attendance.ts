'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getAuthState } from '@/lib/auth/session';

export type AttendanceActionState = { error?: string } | undefined;

// Attendance is for staff physically in Uzbekistan; work_date must reflect
// their local day, not the DB server's (UTC) date, or a late clock-in near
// midnight could land on the wrong day.
function getTashkentWorkDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(date);
}

export async function clockInAction(): Promise<AttendanceActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const supabase = await createClient();
  const workDate = getTashkentWorkDate();

  const { data: existing } = await supabase
    .from('attendance')
    .select('id')
    .eq('user_id', user.id)
    .eq('work_date', workDate)
    .is('clock_out', null)
    .maybeSingle();
  if (existing) return { error: 'alreadyClockedIn' };

  const { error } = await supabase.from('attendance').insert({ user_id: user.id, work_date: workDate });
  if (error) return { error: 'clockInFailed' };

  revalidatePath('/[locale]/attendance', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}

export async function clockOutAction(): Promise<AttendanceActionState> {
  const { user } = await getAuthState();
  if (!user) return { error: 'forbidden' };

  const supabase = await createClient();
  const workDate = getTashkentWorkDate();

  const { data: openSession } = await supabase
    .from('attendance')
    .select('id')
    .eq('user_id', user.id)
    .eq('work_date', workDate)
    .is('clock_out', null)
    .maybeSingle();
  if (!openSession) return { error: 'noOpenSession' };

  const { error } = await supabase
    .from('attendance')
    .update({ clock_out: new Date().toISOString() })
    .eq('id', openSession.id);
  if (error) return { error: 'clockOutFailed' };

  revalidatePath('/[locale]/attendance', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
  return {};
}
