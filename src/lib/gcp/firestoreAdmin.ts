import 'server-only';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from './credentials';

const db = () => getFirestore(getFirebaseAdminApp());

/**
 * Bumps a "something changed" signal doc — the client listens via
 * onSnapshot and re-fetches the real data through its own Server Action
 * (which re-applies full authorization) rather than trusting anything read
 * from Firestore itself. Call this from every Server Action that mutates
 * the underlying table.
 */
export async function bumpSignal(path: string): Promise<void> {
  await db().doc(path).set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export function bumpBoardSignal(board: 'tasks' | 'issues'): Promise<void> {
  return bumpSignal(`board_signals/${board}`);
}

export function bumpNavBadgeSignal(uid: string): Promise<void> {
  return bumpSignal(`nav_badge_signals/${uid}`);
}

export function bumpAnnouncementsSignal(): Promise<void> {
  return bumpSignal('announcements_signal/current');
}
