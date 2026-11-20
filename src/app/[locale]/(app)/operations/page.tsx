import { notFound } from 'next/navigation';
import { canFor, canSeeFor, canSeeOpsMoney } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { tashkentDayKey } from '@/lib/time';
import { emptyStudentsData, loadStudentsData } from '@/lib/ops-students';
import { emptyOpsStats, loadOpsStats, withoutMoney } from '@/lib/ops-stats';
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
  // Statistika (owner, 2026-11-19): student/lead figures and money figures are
  // two Section access functions; money never leaves the server without it.
  const statsPeople = canFor(profile, 'operations.stats');
  const statsMoney = canFor(profile, 'operations.statsMoney');
  const [students, stats, sales] = await Promise.all([
    loadStudentsData({ money }).catch(() => emptyStudentsData(day)),
    statsPeople || statsMoney
      ? loadOpsStats()
          .then((s) => (statsMoney ? s : withoutMoney(s)))
          .catch(() => emptyOpsStats(day))
      : emptyOpsStats(day),
    loadSalesData().catch(() => emptySalesData()),
  ]);
  const data: OpsData = {
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    money,
    statsPeople,
    statsMoney,
    canFixBalance: canFor(profile, 'operations.balanceFix'),
    canCancelOldCharge: canFor(profile, 'operations.chargeCancelOld'),
    today: { day },
    students,
    stats,
    sales,
  };
  return <OperationsWorkspace data={data} />;
}
