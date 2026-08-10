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
  { key: 'staff', href: '/staff', roles: ['ceo', 'it_developer'] },
  { key: 'chat', href: '/chat' },
  { key: 'issues', href: '/issues' },
  {
    key: 'lessonPlans',
    href: '/lesson-plans',
    // SMM & Mobilograf ranks below teacher/assistant and never sees lesson
    // plans — they were previously (incorrectly) included here.
    roles: ['ceo', 'it_developer', 'teacher', 'assistant'],
  },
  { key: 'tasks', href: '/tasks' },
  { key: 'companyNews', href: '/company-news' },
  { key: 'staffChat', href: '/staff-chat', roles: ['teacher', 'assistant', 'admin_manager'] },
  { key: 'selfDevelopment', href: '/self-development' },
  { key: 'finance', href: '/finance' },
  { key: 'missions', href: '/missions' },
  // Roadmap (incl. its Monthly Goals section) is CEO/Administrative Manager
  // territory specifically — mirrors its table's RLS (public.is_admin() =
  // role in ('ceo','admin_manager')), which never included IT Developer even
  // after its rank elevation elsewhere. See requireCeoOrAdminManager().
  { key: 'roadmap', href: '/roadmap', roles: ['ceo', 'admin_manager'] },
  { key: 'profile', href: '/profile' },
  { key: 'telegramSetup', href: '/telegram-setup', roles: ['ceo'] },
  { key: 'settings', href: '/settings' },
];

export function navItemsForRole(role: StaffRole) {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}
