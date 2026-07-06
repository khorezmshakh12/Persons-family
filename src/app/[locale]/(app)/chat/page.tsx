import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ChatHubClient } from '@/components/chat-hub/chat-hub-client';

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
    .select('id, sender_id, receiver_id, message_text, media_url, media_type, pinned_at, created_at')
    .is('receiver_id', null)
    .order('created_at', { ascending: true })
    .limit(50);

  const { data: settings } = await supabase.from('app_settings').select('chat_enabled').eq('id', true).single();

  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <ChatHubClient
        currentUserId={user!.id}
        currentUserName={`${profile!.first_name} ${profile!.last_name}`}
        currentUserAvatar={profile!.avatar_url}
        isAdmin={isAdmin}
        staff={staff ?? []}
        initialFamilyMessages={familyMessages ?? []}
        initialChatEnabled={settings?.chat_enabled ?? true}
      />
    </div>
  );
}
