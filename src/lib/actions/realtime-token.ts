'use server';

import { getAuth } from 'firebase-admin/auth';
import { getFirebaseAdminApp } from '@/lib/gcp/credentials';
import { getAuthState } from '@/lib/auth/session';

/**
 * Mints a short-lived Firebase custom token for the currently signed-in
 * session user, so the browser can call signInWithCustomToken() and get a
 * client-side Firebase Auth session — needed only so Firestore security
 * rules can check request.auth.uid. This is a second, parallel identity
 * from the app's own session cookie (which stays the source of truth for
 * everything else); it exists purely to satisfy Firestore's rules engine.
 */
export async function mintRealtimeToken(): Promise<{ token: string } | { error: string }> {
  // getAuthState, not the raw cookie check: enforces is_active + revocation.
  const { user } = await getAuthState();
  if (!user) return { error: 'sessionExpired' };

  const token = await getAuth(getFirebaseAdminApp()).createCustomToken(user.uid);
  return { token };
}
