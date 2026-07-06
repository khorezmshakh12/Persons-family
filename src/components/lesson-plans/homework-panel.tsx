import { createClient } from '@/lib/supabase/server';
import { HomeworkPanelClient } from './homework-panel-client';
import type { SubmissionStatus } from './submission-status-select';

export type Assignment = { id: string; title: string; description: string | null; due_date: string | null };
export type Student = { id: string; full_name: string };
export type SubmissionsByKey = Record<string, SubmissionStatus>;

// Self-fetching so it streams independently of CourseLessonsSection and the
// staff chat snippet on the group page, instead of one shared await
// blocking all three sections together. Rendering itself (plus the
// optimistic add-flows) lives in the client component below.
export async function HomeworkPanel({ groupId, canEdit }: { groupId: string; canEdit: boolean }) {
  const supabase = await createClient();

  const { data: assignmentsData } = await supabase
    .from('homework_assignments')
    .select('id, title, description, due_date')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false });
  const assignments: Assignment[] = assignmentsData ?? [];

  const { data: studentsData } = await supabase
    .from('homework_students')
    .select('id, full_name')
    .eq('group_id', groupId)
    .order('full_name', { ascending: true });
  const students: Student[] = studentsData ?? [];

  const assignmentIds = assignments.map((a) => a.id);
  const submissionsByKey: SubmissionsByKey = {};
  if (assignmentIds.length > 0) {
    const { data: submissions } = await supabase
      .from('homework_submissions')
      .select('assignment_id, student_id, status')
      .in('assignment_id', assignmentIds);
    for (const s of submissions ?? []) {
      submissionsByKey[`${s.assignment_id}_${s.student_id}`] = s.status as SubmissionStatus;
    }
  }

  return (
    <HomeworkPanelClient
      groupId={groupId}
      canEdit={canEdit}
      assignments={assignments}
      students={students}
      submissionsByKey={submissionsByKey}
    />
  );
}
