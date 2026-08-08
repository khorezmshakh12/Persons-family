import type { Database } from '@/lib/supabase/types';

export type InternshipLevel = Database['public']['Enums']['internship_level'];

export const INTERNSHIP_LEVELS: InternshipLevel[] = ['C', 'B', 'A'];
