import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StaffChatRoom } from '@/components/staff-chat/staff-chat-room';
import type { ChatSender } from '@/components/staff-chat/staff-message-item';
import { GLOBAL_STAFF_CHAT_ID } from '@/lib/staff-chat';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function StaffChatPage() {
  const t = await getTranslations('staffChat');
  const { user } = await getAuthState();
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from('staff_chat_messages')
    .select('id, user_id, content, created_at')
    .eq('conversation_id', GLOBAL_STAFF_CHAT_ID)
    .order('created_at', { ascending: true })
    .limit(50);

  const { data: staff } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, avatar_url')
    .in('role', ['teacher', 'assistant']);

  const staffMap: Record<string, ChatSender> = {};
  for (const s of staff ?? []) {
    staffMap[s.id] = { first_name: s.first_name, last_name: s.last_name, avatar_url: s.avatar_url };
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-4xl flex-col gap-4 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
      <div className={cn(GLASS_CARD, 'min-h-0 flex-1 p-4')}>
        <StaffChatRoom
          conversationId={GLOBAL_STAFF_CHAT_ID}
          initialMessages={messages ?? []}
          staffMap={staffMap}
          currentUserId={user!.id}
        />
      </div>
    </div>
  );
}
