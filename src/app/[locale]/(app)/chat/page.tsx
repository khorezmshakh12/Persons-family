import { Suspense } from 'react';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ChatHubClient } from '@/components/chat-hub/chat-hub-client';
import type { ConversationState } from '@/components/chat-hub/types';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const { user, profile } = await getAuthState();
  const supabase = await createClient();

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url, role')
    .neq('id', user!.id)
    .eq('is_active', true)
    .order('first_name', { ascending: true });

  const { data: unreadRows } = await supabase
    .from('staff_chats')
    .select('sender_id')
    .eq('receiver_id', user!.id)
    .eq('is_read', false);
  const initialUnreadSenderIds = Array.from(new Set((unreadRows ?? []).map((r) => r.sender_id)));

  const { data: conversations } = await supabase
    .from('dm_conversations')
    .select('id, participant_one, participant_two, created_by, request_status')
    .or(`participant_one.eq.${user!.id},participant_two.eq.${user!.id}`);

  const conversationStates: Record<string, ConversationState> = {};
  for (const c of conversations ?? []) {
    const otherId = c.participant_one === user!.id ? c.participant_two : c.participant_one;
    if (c.request_status === 'accepted') {
      conversationStates[otherId] = { kind: 'accepted', conversationId: c.id };
    } else if (c.created_by === user!.id) {
      conversationStates[otherId] = { kind: 'pendingOutgoing', conversationId: c.id };
    } else {
      conversationStates[otherId] = { kind: 'pendingIncoming', conversationId: c.id };
    }
  }

  // A bypass-eligible pair (either side ceo/it_developer) never sees the
  // request step, even before any dm_conversations row exists — the row
  // gets created transparently, already 'accepted', the moment they send
  // their first message (see sendStaffChatAction). Without this, a brand
  // new contact for a CEO would incorrectly show "Send chat request"
  // instead of going straight to the composer.
  const iAmBypass = profile!.role === 'ceo' || profile!.role === 'it_developer';
  for (const s of staff ?? []) {
    if (conversationStates[s.id]) continue;
    if (iAmBypass || s.role === 'ceo' || s.role === 'it_developer') {
      conversationStates[s.id] = { kind: 'accepted', conversationId: '' };
    }
  }

  const canModerateDmImportance = profile!.role === 'ceo' || profile!.role === 'it_developer';

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] w-full max-w-6xl flex-col overflow-hidden p-4 sm:p-6">
      <Suspense>
        <ChatHubClient
          currentUserId={user!.id}
          currentUserName={`${profile!.first_name} ${profile!.last_name}`}
          currentUserAvatar={profile!.avatar_url}
          canModerateDmImportance={canModerateDmImportance}
          staff={staff ?? []}
          conversationStates={conversationStates}
          initialUnreadSenderIds={initialUnreadSenderIds}
        />
      </Suspense>
    </div>
  );
}
