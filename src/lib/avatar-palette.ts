// Aurora avatar fallback: initials on one of five gradients, picked
// deterministically from the staff id so a person keeps the same colour
// everywhere (classes defined in src/app/aurora.css).
const PALETTE = ['au-avatar-1', 'au-avatar-2', 'au-avatar-3', 'au-avatar-4', 'au-avatar-5'] as const;

export function avatarGradientClass(id: string | null | undefined): string {
  if (!id) return PALETTE[0];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function initialsOf(first: string | null | undefined, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}
