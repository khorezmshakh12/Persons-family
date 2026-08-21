import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
import { ChatHubClient } from '@/components/chat-hub/chat-hub-client';
import type { ConversationState } from '@/components/chat-hub/types';
import type { StaffRole } from '@/lib/nav';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const { user, profile } = await getAuthState();

  const [staffRows, unreadRows, conversations] = await Promise.all([
    sql<{ id: string; first_name: string; last_name: string; avatar_url: string | null; role: StaffRole }[]>`
      select id, first_name, last_name, avatar_url, role from profiles
      where id <> ${user!.id} and is_active = true
      order by first_name asc
    `,
    sql<{ sender_id: string }[]>`
      select sender_id from staff_chats where receiver_id = ${user!.id} and is_read = false
    `,
    sql<
      { id: string; participant_one: string; participant_two: string; created_by: string; request_status: string }[]
    >`
      select id, participant_one, participant_two, created_by, request_status from dm_conversations
      where participant_one = ${user!.id} or participant_two = ${user!.id}
    `,
  ]);

  // avatar_url is now a private bucket object path, not a public URL —
  // resolve every staff member's (and the current user's own) signed read
  // URL once here, at the Server Component boundary, rather than in every
  // place downstream that renders one.
  const staff = await Promise.all(
    staffRows.map(async (s) => ({ ...s, avatar_url: await resolveAvatarUrl(s.avatar_url) })),
  );
  const currentUserAvatar = await resolveAvatarUrl(profile!.avatar_url);

  const initialUnreadSenderIds = Array.from(new Set(unreadRows.map((r) => r.sender_id)));

  const conversationStates: Record<string, ConversationState> = {};
  for (const c of conversations) {
    const otherId = c.participant_one === user!.id ? c.participant_two : c.participant_one;
    if (c.request_status === 'accepted') {
      conversationStates[otherId] = { kind: 'accepted', conversationId: c.id };
    } else if (c.created_by === user!.id) {
      conversationStates[otherId] = { kind: 'pendingOutgoing', conversationId: c.id };
    } else {
      conversationStates[otherId] = { kind: 'pendingIncoming', conversationId: c.id };
    }
  }

  // A bypass-eligible pair (either side ceo) never sees the request step,
  // even before any dm_conversations row exists — the row gets created
  // transparently, already 'accepted', the moment they send their first
  // message (see sendStaffChatAction). Without this, a brand new contact
  // for a CEO would incorrectly show "Send chat request" instead of going
  // straight to the composer.
  const iAmBypass = profile!.role === 'ceo';
  for (const s of staff) {
    if (conversationStates[s.id]) continue;
    if (iAmBypass || s.role === 'ceo') {
      conversationStates[s.id] = { kind: 'accepted', conversationId: '' };
    }
  }

  const canModerateDmImportance = profile!.role === 'ceo';

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] w-full max-w-6xl flex-col overflow-hidden p-4 sm:p-6">
      <Suspense>
        <ChatHubClient
          currentUserId={user!.id}
          currentUserName={`${profile!.first_name} ${profile!.last_name}`}
          currentUserAvatar={currentUserAvatar}
          canModerateDmImportance={canModerateDmImportance}
          staff={staff}
          conversationStates={conversationStates}
          initialUnreadSenderIds={initialUnreadSenderIds}
        />
      </Suspense>
    </div>
  );
}
