import "server-only";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./credentials";

const auth = () => getAuth(getFirebaseAdminApp());

// setCustomUserClaims *replaces* the whole claims object rather than
// merging, so every call site that needs to change one claim has to know
// (or fetch) the other — this helper is the one place that shape lives.
export async function setUserClaims(
  uid: string,
  claims: { role: string; mustChangePassword: boolean }
): Promise<void> {
  await auth().setCustomUserClaims(uid, claims);
}

export async function createIdentityUser(params: {
  uid?: string;
  email: string;
  password: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  const user = await auth().createUser({
    uid: params.uid,
    email: params.email,
    password: params.password,
    emailVerified: true,
  });
  await setUserClaims(user.uid, {
    role: params.role,
    mustChangePassword: params.mustChangePassword ?? true,
  });
  return user;
}

export async function setUserPassword(uid: string, password: string): Promise<void> {
  await auth().updateUser(uid, { password });
}

// Login is keyed by a synthetic email derived from phone number (see
// lib/auth/phone.ts) — whenever a staff member's phone number is edited,
// this must run too, or their Identity Platform account keeps signing in
// under the old (now-stale) email while the profile row shows the new
// phone, locking them out under both.
export async function updateIdentityUserEmail(uid: string, email: string): Promise<void> {
  await auth().updateUser(uid, { email, emailVerified: true });
}

export async function deleteIdentityUser(uid: string): Promise<void> {
  await auth().deleteUser(uid);
}
