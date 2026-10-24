import { redirect } from '@/i18n/navigation';
import { getLocale } from 'next-intl/server';

/** Davomat moved into HR as its own tab (owner, 2026-10-14); old links land there. */
export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  const locale = await getLocale();
  redirect({ href: `/hr?tab=attendance${day ? `&day=${encodeURIComponent(day)}` : ''}`, locale });
}
