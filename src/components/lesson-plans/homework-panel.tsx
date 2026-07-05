import { getFormatter, getTranslations } from 'next-intl/server';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateAssignmentDialog } from './create-assignment-dialog';
import { CreateStudentDialog } from './create-student-dialog';
import { SubmissionStatusSelect, type SubmissionStatus } from './submission-status-select';

export type Assignment = { id: string; title: string; description: string | null; due_date: string | null };
export type Student = { id: string; full_name: string };
export type SubmissionsByKey = Record<string, SubmissionStatus>;

export async function HomeworkPanel({
  groupId,
  canEdit,
  assignments,
  students,
  submissionsByKey,
}: {
  groupId: string;
  canEdit: boolean;
  assignments: Assignment[];
  students: Student[];
  submissionsByKey: SubmissionsByKey;
}) {
  const t = await getTranslations('lessonPlans');
  const format = await getFormatter();

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t('homework.title')}</h2>
        {canEdit && <CreateAssignmentDialog groupId={groupId} />}
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-white/70">{t('homework.noAssignments')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="flex flex-col gap-2 border-t border-white/15 pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-semibold">{assignment.title}</span>
                  {assignment.description && <p className="text-sm text-white/70">{assignment.description}</p>}
                </div>
                {assignment.due_date && (
                  <span className="shrink-0 text-xs text-white/50">
                    {t('homework.due')}:{' '}
                    {format.dateTime(new Date(`${assignment.due_date}T00:00:00Z`), {
                      dateStyle: 'medium',
                      timeZone: 'UTC',
                    })}
                  </span>
                )}
              </div>

              {students.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {students.map((student) => (
                    <div key={student.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>{student.full_name}</span>
                      {canEdit ? (
                        <SubmissionStatusSelect
                          assignmentId={assignment.id}
                          studentId={student.id}
                          status={submissionsByKey[`${assignment.id}_${student.id}`] ?? 'pending'}
                        />
                      ) : (
                        <span className="text-xs text-white/60">
                          {t(`homework.status.${submissionsByKey[`${assignment.id}_${student.id}`] ?? 'pending'}`)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/15 pt-3">
        <span className="text-xs text-white/50">
          {t('homework.rosterCount', { count: students.length })}
        </span>
        {canEdit && <CreateStudentDialog groupId={groupId} />}
      </div>
    </div>
  );
}
