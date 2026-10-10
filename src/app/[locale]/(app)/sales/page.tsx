import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { can, canSeeFor } from '@/lib/permissions';
import { loadIntake } from '@/lib/intake-data';
import { IntakeView } from '@/components/intake/intake-view';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

/** Qabul statistikasi — native since 2026-10-09 (was the Core sales page).
 * Statistics only: this is a staff CRM, not a student pipeline. */
export default async function SalesPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'sales')) notFound();
  const intake = await loadIntake('month');
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <BgVideo variant="hero" />
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">Qabul statistikasi</h1>
        <p className="text-au-muted">Kelganlar, sinov darslari va yozilishlar — manba, kurs va vaqt kesimida, oylik reja bilan.</p>
      </div>
      <IntakeView initial={intake} canEdit={can(profile.role, 'core.sales.edit')} />
    </div>
  );
}
