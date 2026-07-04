import type { Database } from '@/lib/supabase/types';

export type StaffRole = Database['public']['Enums']['staff_role'];

export type NavItem = {
  key: 'dashboard' | 'staff' | 'attendance' | 'chat' | 'issues' | 'lessonPlans';
  href: string;
  roles?: StaffRole[];
};

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'staff', href: '/staff', roles: ['ceo', 'admin_manager'] },
  { key: 'attendance', href: '/attendance' },
  { key: 'chat', href: '/chat' },
  { key: 'issues', href: '/issues' },
  { key: 'lessonPlans', href: '/lesson-plans' },
];

export function navItemsForRole(role: StaffRole) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
