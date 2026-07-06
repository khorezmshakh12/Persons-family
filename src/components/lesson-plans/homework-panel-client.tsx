'use client';

import { useOptimistic } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';
import { CreateAssignmentDialog } from './create-assignment-dialog';
import { CreateStudentDialog } from './create-student-dialog';
import { SubmissionStatusSelect } from './submission-status-select';
import type { Assignment, Student, SubmissionsByKey } from './homework-panel';

// Owns optimistic state for the two "add" flows (assignment, student):
// createAssignmentAction/createStudentAction only update the visible list
// once their revalidatePath round-trips back through the server tree, so
// without this the roster/assignment list would sit still for a beat after
// clicking Create.
export function HomeworkPanelClient({
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
  const t = useTranslations('lessonPlans');
  const format = useFormatter();

  const [optimisticAssignments, addOptimisticAssignment] = useOptimistic(
    assignments,
    (state, newAssignment: Assignment) => [newAssignment, ...state],
  );
  const [optimisticStudents, addOptimisticStudent] = useOptimistic(
    students,
    (state, newStudent: Student) => [...state, newStudent].sort((a, b) => a.full_name.localeCompare(b.full_name)),
  );

  function handleOptimisticAssignment(input: { title: string; description: string; dueDate: string }) {
    addOptimisticAssignment({
      id: `optimistic-${Date.now()}`,
      title: input.title,
      description: input.description || null,
      due_date: input.dueDate || null,
    });
  }

  function handleOptimisticStudent(fullName: string) {
    addOptimisticStudent({ id: `optimistic-${Date.now()}`, full_name: fullName });
  }

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-4 p-6')}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{t('homework.title')}</h2>
        {canEdit && <CreateAssignmentDialog groupId={groupId} onOptimisticAdd={handleOptimisticAssignment} />}
      </div>

      {optimisticAssignments.length === 0 ? (
        <p className="text-sm text-white/70">{t('homework.noAssignments')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {optimisticAssignments.map((assignment) => {
            const isOptimisticAssignment = assignment.id.startsWith('optimistic-');
            return (
              <div
                key={assignment.id}
                className={cn(
                  'flex flex-col gap-2 border-t border-white/15 pt-3 first:border-t-0 first:pt-0',
                  isOptimisticAssignment && 'opacity-60',
                )}
              >
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

                {optimisticStudents.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {optimisticStudents.map((student) => {
                      const isOptimisticStudent = student.id.startsWith('optimistic-');
                      // A row still needs its real, persisted id before the
                      // status control can target it with a valid update.
                      const canEditRow = canEdit && !isOptimisticAssignment && !isOptimisticStudent;
                      return (
                        <div key={student.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className={isOptimisticStudent ? 'opacity-60' : undefined}>{student.full_name}</span>
                          {canEditRow ? (
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
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-white/15 pt-3">
        <span className="text-xs text-white/50">{t('homework.rosterCount', { count: optimisticStudents.length })}</span>
        {canEdit && <CreateStudentDialog groupId={groupId} onOptimisticAdd={handleOptimisticStudent} />}
      </div>
    </div>
  );
}
