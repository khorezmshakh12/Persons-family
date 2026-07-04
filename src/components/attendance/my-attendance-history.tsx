import { getTranslations, getFormatter } from 'next-intl/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDuration } from '@/lib/format-duration';

type Record = {
  id: string;
  work_date: string;
  clock_in: string;
  clock_out: string | null;
};

export async function MyAttendanceHistory({ records }: { records: Record[] }) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();

  if (records.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noRecords')}</p>;
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.date')}</TableHead>
            <TableHead>{t('table.clockIn')}</TableHead>
            <TableHead>{t('table.clockOut')}</TableHead>
            <TableHead>{t('table.duration')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.work_date}</TableCell>
              <TableCell>
                {format.dateTime(new Date(r.clock_in), { hour: '2-digit', minute: '2-digit' })}
              </TableCell>
              <TableCell>
                {r.clock_out
                  ? format.dateTime(new Date(r.clock_out), { hour: '2-digit', minute: '2-digit' })
                  : t('stillClockedIn')}
              </TableCell>
              <TableCell>
                {formatDuration(r.clock_in, r.clock_out, t('hoursAbbrev'), t('minutesAbbrev'))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
