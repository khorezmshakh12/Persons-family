import { notFound } from 'next/navigation';
import { getAuthState } from '@/lib/auth/session';
import { can, canSeeFor } from '@/lib/permissions';
import { sql } from '@/lib/db/client';
import { loadTeamReport } from '@/lib/team-report-data';
import { parseConfig } from '@/lib/team-report';
import { ReportsView } from '@/components/report/reports-view';
import type { SavedReport } from '@/lib/actions/team-report';
import { BgVideo } from '@/components/motion/bg-video';

export const dynamic = 'force-dynamic';

export default async function ReportPage() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'report')) notFound();

  const [report, rows] = await Promise.all([
    loadTeamReport('week', null, can(profile.role, 'kpi.review')),
    sql<{ id: string; name: string; config: unknown; shared: boolean; owner_id: string }[]>`
      select id, name, config, shared, owner_id from saved_reports
      where owner_id = ${profile.id} or shared
      order by updated_at desc limit 50`,
  ]);
  const saved: SavedReport[] = rows.flatMap((r) => {
    const config = parseConfig(r.config);
    return config ? [{ id: r.id, name: r.name, config, shared: r.shared, mine: r.owner_id === profile.id }] : [];
  });

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 pt-1 pb-8 sm:px-7">
      <div className="relative flex flex-col gap-1 overflow-hidden rounded-au-card bg-au-hero px-6 py-6 sm:px-[30px] sm:py-7">
        <BgVideo variant="hero" />
        <h1 className="text-[28px] leading-[34px] font-bold tracking-tight text-au-ink">Hisobotlar</h1>
        <p className="text-au-muted">Jamoa natijalari bir joyda: vazifalar, muammolar, kelganlar, o‘zini rivojlantirish va KPI — davrlar kesimida.</p>
      </div>
      <ReportsView initial={report} saved={saved} me={`${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()} />
    </div>
  );
}
