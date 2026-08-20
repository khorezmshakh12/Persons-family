'use client';

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { mintRealtimeToken } from '@/lib/actions/realtime-token';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
};

let app: FirebaseApp | undefined;
function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig);
  return app;
}

export function getRealtimeDb(): Firestore {
  return getFirestore(getFirebaseApp());
}

function getRealtimeAuth(): Auth {
  return getAuth(getFirebaseApp());
}

// Cached across the whole tab so every component that needs Firestore
// shares one sign-in — mintRealtimeToken()+signInWithCustomToken() only
// needs to happen once per page load, not once per listener.
let signInPromise: Promise<void> | undefined;

/**
 * Ensures the browser has a Firebase Auth session matching the app's own
 * (cookie-based) session, so Firestore security rules' request.auth.uid
 * checks pass. Every component that reads/writes Firestore must await this
 * before subscribing — call it from a useEffect, not at module scope.
 */
export function ensureRealtimeSignedIn(): Promise<void> {
  if (!signInPromise) {
    signInPromise = (async () => {
      const result = await mintRealtimeToken();
      if ('error' in result) throw new Error(result.error);
      await signInWithCustomToken(getRealtimeAuth(), result.token);
    })().catch((error) => {
      // Let the next caller retry instead of getting stuck on a permanent
      // rejection (e.g. a transient mint failure right after login).
      signInPromise = undefined;
      throw error;
    });
  }
  return signInPromise;
}
