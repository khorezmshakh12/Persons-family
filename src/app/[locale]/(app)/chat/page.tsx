import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ChatHubClient } from '@/components/chat-hub/chat-hub-client';
import type { StaffChatMessage } from '@/components/chat-hub/types';

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

  const { data: familyMessages } = await supabase
    .from('staff_chats')
    .select(
      'id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at, is_read, reply_to_id, reactions',
    )
    .is('receiver_id', null)
    .order('created_at', { ascending: true })
    .limit(50);

  const { data: unreadRows } = await supabase
    .from('staff_chats')
    .select('sender_id')
    .eq('receiver_id', user!.id)
    .eq('is_read', false);
  const initialUnreadSenderIds = Array.from(new Set((unreadRows ?? []).map((r) => r.sender_id)));

  const { data: settings } = await supabase
    .from('app_settings')
    .select('chat_enabled')
    .eq('id', true)
    .single();

  const isAdmin = profile!.role === 'ceo';
  const canModerateDmImportance = profile!.role === 'ceo' || profile!.role === 'it_developer';

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] w-full max-w-6xl flex-col overflow-hidden p-4 sm:p-6">
      <ChatHubClient
        currentUserId={user!.id}
        currentUserName={`${profile!.first_name} ${profile!.last_name}`}
        currentUserAvatar={profile!.avatar_url}
        isAdmin={isAdmin}
        canModerateDmImportance={canModerateDmImportance}
        staff={staff ?? []}
        initialFamilyMessages={(familyMessages as unknown as StaffChatMessage[]) ?? []}
        initialUnreadSenderIds={initialUnreadSenderIds}
        initialChatEnabled={settings?.chat_enabled ?? true}
      />
    </div>
  );
}
