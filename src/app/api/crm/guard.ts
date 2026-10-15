import 'server-only';
import { getAuthState } from '@/lib/auth/session';
import { canSeeFor } from '@/lib/permissions';

// CRM yozuv endpointlari uchun yagona himoya: getAuthState (is_active +
// sessiya bekor qilinishini tekshiradi) + canSeeFor (CEO/COO rol matritsasi,
// SECTION_ROLES.crmPersons). Ruxsat bo'lmasa null qaytaradi; endpoint 401 beradi.
export async function crmUser() {
  const { profile } = await getAuthState();
  if (!profile || !canSeeFor(profile, 'crmPersons')) return null;
  return profile;
}
