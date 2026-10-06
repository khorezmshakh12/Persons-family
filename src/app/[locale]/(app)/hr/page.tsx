import { CoreSection } from '@/components/core/core-section';
import { EmployeeStatsTable } from '@/components/aurora/employee-stats-table';
import { getAuthState } from '@/lib/auth/session';
import { loadEmployeeTaskStats } from '@/lib/aurora-dashboard';
import { can } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { profile } = await getAuthState();
  // Employee statistics moved here from the CEO dashboard (owner,
  // 2026-10-06) — company-wide figures, so the same company.overview gate.
  const overview = !!profile && can(profile.role, 'company.overview');
  const rows = overview ? await loadEmployeeTaskStats() : null;
  return (
    <div className="flex flex-col gap-[18px]">
      {overview && (
        <div className="mx-auto w-full max-w-[1440px] px-4 pt-1 sm:px-7">
          <EmployeeStatsTable rows={rows} />
        </div>
      )}
      <CoreSection view="hr" navKey="hr" />
    </div>
  );
}
