'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAdmin, authErrorCode } from '@/lib/auth/require-admin';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { logSystemAction } from '@/lib/audit-log';
import { bumpAnnouncementsSignal } from '@/lib/gcp/firestoreAdmin';

const SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

export type AnnouncementActionState = { error?: string } | undefined;

const publishSchema = z.object({ message: z.string().trim().min(1).max(300) });

export async function publishAnnouncementAction(
  _prevState: AnnouncementActionState,
  formData: FormData,
): Promise<AnnouncementActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  const parsed = publishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: 'invalidInput' };

  // Only one active banner at a time — publishing a new one replaces
  // whatever's currently showing. Done in a transaction so a failed insert
  // can't leave the banner blank for everyone (the old delete-then-insert
  // did exactly that, and threw an unhandled exception on top).
  try {
    await sql.begin(async (tx) => {
      await tx`delete from platform_announcements where id <> ${SENTINEL_ID}`;
      await tx`insert into platform_announcements (message) values (${parsed.data.message})`;
    });
  } catch (error) {
    console.error('publishAnnouncementAction failed', error instanceof Error ? error.message : error);
    return { error: 'publishFailed' };
  }

  logSystemAction('announcement.publish', `Published announcement: "${parsed.data.message}"`);
  await bumpAnnouncementsSignal();

  revalidatePath('/[locale]/settings', 'page');
  return {};
}

/**
 * Re-fetch for AnnouncementBanner's live refresh, triggered whenever
 * announcements_signal/current changes in Firestore (see
 * bumpAnnouncementsSignal). Returns null once the active banner is
 * cleared/expired, same as the page-load query this mirrors.
 */
export async function getCurrentAnnouncementAction(): Promise<string | null> {
  const { user } = await getAuthState();
  if (!user) return null;

  const [row] = await sql<{ message: string }[]>`
    select message from platform_announcements
    where expires_at is null or expires_at > now()
    order by created_at desc
    limit 1
  `;
  return row?.message ?? null;
}

export async function clearAnnouncementAction(): Promise<AnnouncementActionState> {
  try {
    await requireAdmin();
  } catch (error) {
    return { error: authErrorCode(error) };
  }

  try {
    await sql`delete from platform_announcements where id <> ${SENTINEL_ID}`;
  } catch (error) {
    console.error('clearAnnouncementAction failed', error instanceof Error ? error.message : error);
    return { error: 'updateFailed' };
  }

  logSystemAction('announcement.clear', 'Cleared the active announcement banner');
  await bumpAnnouncementsSignal();

  revalidatePath('/[locale]/settings', 'page');
  return {};
}
