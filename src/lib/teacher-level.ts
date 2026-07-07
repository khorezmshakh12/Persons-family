import type { Database } from '@/lib/supabase/types';

export type TeacherLevel = Database['public']['Enums']['teacher_level'];

export const TEACHER_LEVELS: TeacherLevel[] = ['C', 'C+', 'C++', 'B', 'B+', 'B++', 'A', 'A+', 'A++'];

const REVIEW_DUE_MONTHS = 3;

/** True once a teacher's level hasn't been touched in 3+ months — surfaced
 * to the CEO as a "Review due" nudge on the Staff table. */
export function isLevelReviewDue(levelUpdatedAt: string): boolean {
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - REVIEW_DUE_MONTHS);
  return new Date(levelUpdatedAt) < threshold;
}
