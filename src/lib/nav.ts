import type { Database } from '@/lib/supabase/types';

export type StaffRole = Database['public']['Enums']['staff_role'];

export type NavItem = {
  key:
    | 'dashboard'
    | 'staff'
    | 'chat'
    | 'issues'
    | 'lessonPlans'
    | 'tasks'
    | 'companyNews'
    | 'telegramSetup'
    | 'selfDevelopment'
    | 'finance'
    | 'missions'
    | 'roadmap'
    | 'profile'
    | 'settings';
  href: string;
  roles?: StaffRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'staff', href: '/staff', roles: ['ceo'] },
  { key: 'chat', href: '/chat' },
  { key: 'issues', href: '/issues' },
  {
    key: 'lessonPlans',
    href: '/lesson-plans',
    // IT Developer lost lesson-plan access entirely (view, comment, nav) —
    // Head Teacher takes its place as the non-CEO role that can see every
    // teacher's lesson plans and comment on them. SMM & Mobilograf ranks
    // below teacher/assistant and never sees lesson plans either.
    roles: ['ceo', 'head_teacher', 'teacher', 'assistant'],
  },
  { key: 'tasks', href: '/tasks' },
  { key: 'companyNews', href: '/company-news' },
  { key: 'selfDevelopment', href: '/self-development' },
  { key: 'finance', href: '/finance' },
  { key: 'missions', href: '/missions' },
  // Roadmap (incl. its Monthly Goals section) is CEO/Administrative Manager
  // territory specifically — mirrors its table's RLS (an explicit
  // `current_role() in ('ceo','admin_manager')`, not the shared
  // is_admin()). IT Developer, now a plain regular employee, never has it.
  { key: 'roadmap', href: '/roadmap', roles: ['ceo', 'admin_manager'] },
  { key: 'profile', href: '/profile' },
  { key: 'telegramSetup', href: '/telegram-setup', roles: ['ceo'] },
  { key: 'settings', href: '/settings' },
];

export function navItemsForRole(role: StaffRole) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
