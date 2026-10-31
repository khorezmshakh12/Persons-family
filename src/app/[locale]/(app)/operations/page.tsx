import { notFound } from 'next/navigation';
import { canFor, canSeeFor, canSeeOpsMoney } from '@/lib/permissions';
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
  // Sales manager: students and leads, but no money figures (owner, 2026-10-31).
  const money = canSeeOpsMoney(profile);
  const [students, stats, sales] = await Promise.all([
    loadStudentsData({ money }).catch(() => emptyStudentsData(day)),
    money ? loadOpsStats().catch(() => emptyOpsStats(day)) : emptyOpsStats(day),
    loadSalesData().catch(() => emptySalesData()),
  ]);
  const data: OpsData = {
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    money,
    canFixBalance: canFor(profile, 'operations.balanceFix'),
    today: { day },
    students,
    stats,
    sales,
  };
  return <OperationsWorkspace data={data} />;
}
