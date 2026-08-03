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
    | 'staffChat'
    | 'telegramSetup'
    | 'selfDevelopment'
    | 'profile'
    | 'settings';
  href: string;
  roles?: StaffRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'staff', href: '/staff', roles: ['ceo', 'it_developer'] },
  { key: 'chat', href: '/chat' },
  { key: 'issues', href: '/issues' },
  { key: 'lessonPlans', href: '/lesson-plans' },
  { key: 'tasks', href: '/tasks' },
  { key: 'companyNews', href: '/company-news' },
  { key: 'staffChat', href: '/staff-chat', roles: ['teacher', 'assistant', 'admin_manager'] },
  { key: 'selfDevelopment', href: '/self-development' },
  { key: 'profile', href: '/profile' },
  { key: 'telegramSetup', href: '/telegram-setup', roles: ['ceo'] },
  { key: 'settings', href: '/settings' },
];

export function navItemsForRole(role: StaffRole) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
