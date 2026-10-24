import { notFound } from 'next/navigation';
import { canFor, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { tashkentDayKey } from '@/lib/time';
import { emptyStudentsData, loadStudentsData } from '@/lib/ops-students';
import { emptyOpsStats, loadOpsStats } from '@/lib/ops-stats';
import { emptySalesData, loadSalesData } from '@/lib/ops-sales';
import { OperationsWorkspace, type OpsData } from '@/components/strategy/operations-workspace';

export const dynamic = 'force-dynamic';

// Operation HQ (2026-10-23): Statistika (kunlik · haftalik · oylik) ·
// O'quvchilar · Sales (lidlar kanbani).
export default async function OperationsPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) notFound();

  const day = tashkentDayKey();
  const [students, stats, sales] = await Promise.all([
    loadStudentsData().catch(() => emptyStudentsData(day)),
    loadOpsStats().catch(() => emptyOpsStats(day)),
    loadSalesData().catch(() => emptySalesData()),
  ]);
  const data: OpsData = {
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    today: { day },
    students,
    stats,
    sales,
  };
  return <OperationsWorkspace data={data} />;
}
