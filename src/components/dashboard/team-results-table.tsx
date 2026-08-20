import { getTranslations } from 'next-intl/server';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { TierBadge } from '@/components/staff/tier-badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export async function TeamResultsTable() {
  const t = await getTranslations('dashboard');

  const [staffProfiles, performanceRows] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; avatar_url: string | null }[]>`
      select id, first_name, last_name, avatar_url from profiles
      where role in ('teacher', 'assistant') and is_active = true
      order by first_name asc
    `,
    sql<{ staff_id: string; current_tier: 'A' | 'B' | 'C'; months_in_tier: number }[]>`
      select staff_id, current_tier, months_in_tier from staff_performance
    `,
  ]);

  const performanceByStaffId = Object.fromEntries(performanceRows.map((row) => [row.staff_id, row]));

  const staff = await Promise.all(
    staffProfiles.map(async (p) => ({
      ...p,
      avatarUrl: await resolveAvatarUrl(p.avatar_url),
      performance: performanceByStaffId[p.id] ?? null,
    })),
  );

  if (staff.length === 0) {
    return <p className="text-sm text-white/70">{t('teamResults.noStaff')}</p>;
  }

  return (
    <div className={cn(GLASS_CARD)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('teamResults.name')}</TableHead>
            <TableHead>{t('teamResults.tier')}</TableHead>
            <TableHead>{t('teamResults.progressToNextTier')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {staff.map((member) => {
            const tier = member.performance?.current_tier ?? 'C';
            const monthsInTier = member.performance?.months_in_tier ?? 0;
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback>
                        {member.first_name[0]}
                        {member.last_name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span>
                      {member.first_name} {member.last_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <TierBadge tier={tier} />
                </TableCell>
                <TableCell>
                  <div className="flex max-w-40 flex-col gap-1">
                    <Progress value={(monthsInTier / 6) * 100} />
                    <span className="text-xs text-white/60">
                      {t('teamResults.monthsProgress', { months: monthsInTier })}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
