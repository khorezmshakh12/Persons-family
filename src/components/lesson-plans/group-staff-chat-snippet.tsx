import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { StaffChatRoomLazy as StaffChatRoom } from '@/components/staff-chat/staff-chat-room-lazy';
import type { ChatSender } from '@/components/staff-chat/staff-message-item';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export async function GroupStaffChatSnippet({
  groupId,
  groupName,
  canPost,
}: {
  groupId: string;
  groupName: string;
  /** Only the group's teacher and assigned TA can post; CEO/Admin get
   * read-only "monitor" access. */
  canPost: boolean;
}) {
  const t = await getTranslations('lessonPlans');
  const { user } = await getAuthState();
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from('staff_chat_messages')
    .select('id, user_id, content, created_at')
    .eq('conversation_id', groupId)
    .order('created_at', { ascending: true })
    .limit(20);

  // This chat is now strictly between the group's teacher and their
  // assigned TA, so only their two names ever need resolving — not every
  // teacher/assistant in the company.
  const { data: group } = await supabase.from('groups').select('teacher_id, assigned_ta_id').eq('id', groupId).maybeSingle();
  const participantIds = [group?.teacher_id, group?.assigned_ta_id].filter((id): id is string => Boolean(id));

  const staffMap: Record<string, ChatSender> = {};
  if (participantIds.length > 0) {
    const { data: staff } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, avatar_url')
      .in('id', participantIds);
    for (const s of staff ?? []) {
      staffMap[s.id] = { first_name: s.first_name, last_name: s.last_name, avatar_url: s.avatar_url };
    }
  }

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6')}>
      <h2 className="text-lg font-medium">{t('staffChat.title', { name: groupName })}</h2>
      <StaffChatRoom
        conversationId={groupId}
        initialMessages={messages ?? []}
        staffMap={staffMap}
        currentUserId={user!.id}
        canPost={canPost}
        compact
      />
    </div>
  );
}
