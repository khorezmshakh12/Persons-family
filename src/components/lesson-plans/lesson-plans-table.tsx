import { getTranslations, getFormatter } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeleteLessonPlanButton } from './delete-lesson-plan-button';
import { GLASS_CARD } from '@/lib/glass';

type LessonPlanRow = {
  id: string;
  topic: string;
  plan_date: string;
  file_name: string | null;
  downloadUrl: string | null;
  teacher: { first_name: string; last_name: string } | null;
};

export async function LessonPlansTable({
  plans,
  showTeacherColumn,
  showActions,
}: {
  plans: LessonPlanRow[];
  showTeacherColumn: boolean;
  showActions: boolean;
}) {
  const t = await getTranslations('lessonPlans');
  const format = await getFormatter();

  if (plans.length === 0) {
    return <p className="text-sm text-white/70">{t('noPlans')}</p>;
  }

  return (
    <div className={cn(GLASS_CARD)}>
      <Table>
        <TableHeader>
          <TableRow>
            {showTeacherColumn && <TableHead>{t('table.teacher')}</TableHead>}
            <TableHead>{t('table.topic')}</TableHead>
            <TableHead>{t('table.date')}</TableHead>
            <TableHead>{t('table.file')}</TableHead>
            {showActions && <TableHead className="text-right">{t('table.actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan.id}>
              {showTeacherColumn && (
                <TableCell>
                  {plan.teacher ? `${plan.teacher.first_name} ${plan.teacher.last_name}` : '—'}
                </TableCell>
              )}
              <TableCell>{plan.topic}</TableCell>
              <TableCell>
                {format.dateTime(new Date(`${plan.plan_date}T00:00:00Z`), {
                  dateStyle: 'medium',
                  timeZone: 'UTC',
                })}
              </TableCell>
              <TableCell>
                {plan.downloadUrl ? (
                  <a
                    href={plan.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: 'outline', size: 'sm' }),
                      'rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20',
                    )}
                  >
                    <FileText className="size-3.5" />
                    {t('download')}
                  </a>
                ) : (
                  <span className="text-sm text-white/70">—</span>
                )}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <DeleteLessonPlanButton planId={plan.id} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
