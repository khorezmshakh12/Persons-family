import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { ChatRoom } from '@/components/chat/chat-room';
import type { ChatSender } from '@/components/chat/message-item';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const { user, profile } = await getAuthState();
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from('chat_messages')
    .select('id, user_id, content, created_at, pinned_at')
    .order('created_at', { ascending: true })
    .limit(50);

  const { data: staff } = await supabase.from('profiles').select('id, first_name, last_name, avatar_url');
  const { data: settings } = await supabase.from('app_settings').select('chat_enabled').eq('id', true).single();

  const staffMap: Record<string, ChatSender> = {};
  for (const s of staff ?? []) {
    staffMap[s.id] = { first_name: s.first_name, last_name: s.last_name, avatar_url: s.avatar_url };
  }

  const isAdmin = profile!.role === 'ceo' || profile!.role === 'admin_manager';

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-4xl flex-col">
      <ChatRoom
        initialMessages={messages ?? []}
        staffMap={staffMap}
        currentUserId={user!.id}
        isAdmin={isAdmin}
        initialChatEnabled={settings?.chat_enabled ?? true}
      />
    </div>
  );
}
