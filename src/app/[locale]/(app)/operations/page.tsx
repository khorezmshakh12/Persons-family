import { notFound } from 'next/navigation';
import { canFor, canSeeFor } from '@/lib/permissions';
import { getAuthState } from '@/lib/auth/session';
import { tashkentDayKey } from '@/lib/time';
import { emptyStudentsData, loadStudentsData } from '@/lib/ops-students';
import { emptyOpsStats, loadOpsStats } from '@/lib/ops-stats';
import { OperationsWorkspace, type OpsData } from '@/components/strategy/operations-workspace';

export const dynamic = 'force-dynamic';

// Operation HQ (2026-10-23): Statistika (kunlik · haftalik · oylik) ·
// O'quvchilar. The Sales kanban was removed on 2026-10-23.
export default async function OperationsPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'operations')) notFound();

  const day = tashkentDayKey();
  const [students, stats] = await Promise.all([
    loadStudentsData().catch(() => emptyStudentsData(day)),
    loadOpsStats().catch(() => emptyOpsStats(day)),
  ]);
  const data: OpsData = {
    meId: profile.id,
    canEdit: canFor(profile, 'operations.edit'),
    today: { day },
    students,
    stats,
  };
  return <OperationsWorkspace data={data} />;
}
