const KNOWN_ROLES = new Set([
  'ceo',
  'admin_manager',
  'teacher',
  'head_teacher',
  'assistant',
  'mmd',
  'internship',
  'it_developer',
]);

/**
 * `staff.roles` only has entries for the closed role set above. A profile
 * row can still end up with something outside it (a leftover value from
 * before this set existed, a direct DB edit) — calling `t(`roles.${role}`)`
 * for one throws MISSING_MESSAGE and takes down the whole page via the
 * nearest error boundary. Falling back to the raw value keeps the page
 * rendering instead.
 */
export function roleLabel(t: (key: string) => string, role: string): string {
  return KNOWN_ROLES.has(role) ? t(`roles.${role}`) : role;
}
