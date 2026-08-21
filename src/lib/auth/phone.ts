/**
 * Staff log in with a phone number, but Identity Platform is email/password
 * under the hood. We normalize every phone number to E.164 for Uzbekistan
 * (+998...) and derive a synthetic email from it that Identity Platform
 * actually stores.
 */

const COUNTRY_CODE = '998';
const E164_LENGTH = 12; // 998 + 9 digits

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');

  let national = digits;
  if (national.startsWith(COUNTRY_CODE) && national.length === E164_LENGTH) {
    // already has the country code
  } else if (national.length === E164_LENGTH - COUNTRY_CODE.length) {
    national = `${COUNTRY_CODE}${national}`;
  } else {
    return null;
  }

  if (national.length !== E164_LENGTH) return null;
  return `+${national}`;
}

export function phoneToSyntheticEmail(normalizedPhone: string): string {
  const digits = normalizedPhone.replace(/\D/g, '');
  const domain = process.env.AUTH_SYNTHETIC_EMAIL_DOMAIN ?? 'staff.persons-edu.internal';
  return `${digits}@${domain}`;
}
