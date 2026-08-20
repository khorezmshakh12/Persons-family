import { getTranslations } from 'next-intl/server';
import { getAuthState } from '@/lib/auth/session';
import { sql } from '@/lib/db/client';
import { resolveAvatarUrl } from '@/lib/gcp/avatarUrl';
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

  const messages = await sql<{ id: string; user_id: string; content: string; created_at: string }[]>`
    select id, user_id, content, created_at from staff_chat_messages
    where conversation_id = ${groupId}
    order by created_at asc limit 20
  `;

  // This chat is now strictly between the group's teacher and their
  // assigned TA, so only their two names ever need resolving — not every
  // teacher/assistant in the company.
  const [group] = await sql<{ teacher_id: string | null; assigned_ta_id: string | null }[]>`
    select teacher_id, assigned_ta_id from groups where id = ${groupId}
  `;
  const participantIds = [group?.teacher_id, group?.assigned_ta_id].filter((id): id is string => Boolean(id));

  const staffMap: Record<string, ChatSender> = {};
  if (participantIds.length > 0) {
    const staff = await sql<{ id: string; first_name: string; last_name: string; avatar_url: string | null }[]>`
      select id, first_name, last_name, avatar_url from profiles where id in ${sql(participantIds)}
    `;
    for (const s of staff) {
      staffMap[s.id] = { first_name: s.first_name, last_name: s.last_name, avatar_url: await resolveAvatarUrl(s.avatar_url) };
    }
  }

  return (
    <div className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6')}>
      <h2 className="font-heading text-lg font-medium">{t('staffChat.title', { name: groupName })}</h2>
      <StaffChatRoom
        conversationId={groupId}
        initialMessages={messages}
        staffMap={staffMap}
        currentUserId={user!.id}
        canPost={canPost}
        compact
      />
    </div>
  );
}
