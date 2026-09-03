'use server';

import { getAuthState } from '@/lib/auth/session';
import {
  markTasksSeen,
  markIssuesSeen,
  markIssueSeen,
  markWarningsSeen,
  markCompanyNewsSeen,
  markLessonPlanAlertsSeen,
  markConversationRead,
} from '@/lib/db/queries/mark-seen';

// Thin 'use server' wrappers around lib/db/queries/mark-seen.ts — the
// notification bell and the individual mark-seen components (tasks/issues/
// warnings/company-news) are client components, so they need something
// callable across the client/server boundary rather than the plain
// server-only functions themselves. Each derives the caller from the
// session rather than trusting a client-supplied id, same as the old
// security-definer RPCs did with auth.uid().
//
// The boolean return is "did this actually flip a row" — the client
// components use it to skip a pointless router.refresh() when there was
// nothing to mark. Callers that don't care can ignore it.

export async function markTasksSeenAction(): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markTasksSeen(user.id) : false;
}

export async function markIssuesSeenAction(): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markIssuesSeen(user.id) : false;
}

export async function markIssueSeenAction(issueId: string): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markIssueSeen(user.id, issueId) : false;
}

export async function markWarningsSeenAction(): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markWarningsSeen(user.id) : false;
}

export async function markCompanyNewsSeenAction(): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markCompanyNewsSeen(user.id) : false;
}

export async function markLessonPlanAlertsSeenAction(): Promise<boolean> {
  const { profile } = await getAuthState();
  return profile ? markLessonPlanAlertsSeen(profile.role) : false;
}

export async function markConversationReadAction(otherUserId: string): Promise<boolean> {
  const { user } = await getAuthState();
  return user ? markConversationRead(user.id, otherUserId) : false;
}
