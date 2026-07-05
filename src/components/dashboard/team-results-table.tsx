import { getTranslations } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { TierBadge, type StaffTier } from '@/components/staff/tier-badge';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

type TeamMember = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  performance: { current_tier: StaffTier; months_in_tier: number } | null;
};

export async function TeamResultsTable({ staff }: { staff: TeamMember[] }) {
  const t = await getTranslations('dashboard');

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
                      <AvatarImage src={member.avatar_url ?? undefined} alt="" />
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
