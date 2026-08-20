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

export async function markTasksSeenAction(): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markTasksSeen(user.id);
}

export async function markIssuesSeenAction(): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markIssuesSeen(user.id);
}

export async function markIssueSeenAction(issueId: string): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markIssueSeen(user.id, issueId);
}

export async function markWarningsSeenAction(): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markWarningsSeen(user.id);
}

export async function markCompanyNewsSeenAction(): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markCompanyNewsSeen(user.id);
}

export async function markLessonPlanAlertsSeenAction(): Promise<void> {
  const { profile } = await getAuthState();
  if (profile) await markLessonPlanAlertsSeen(profile.role);
}

export async function markConversationReadAction(otherUserId: string): Promise<void> {
  const { user } = await getAuthState();
  if (user) await markConversationRead(user.id, otherUserId);
}
