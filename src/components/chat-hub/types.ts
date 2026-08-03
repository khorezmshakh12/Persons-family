import type { ChatMediaType } from '@/lib/chat-media';
import type { StaffRole } from '@/lib/nav';

export type StaffChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_text: string | null;
  media_url: string | null;
  media_type: ChatMediaType;
  pinned_at: string | null;
  created_at: string;
  is_read: boolean;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
};

export type ChatQuote = {
  id: string;
  senderName: string;
  text: string | null;
  mediaType: ChatMediaType;
};

export type StaffDirectoryEntry = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: StaffRole;
};

/** Per-contact conversation state, derived server-side (chat/page.tsx) from
 * dm_conversations rows + the viewer's/contact's roles. 'none' covers both
 * "never contacted" and "they declined, not shown again unless retried". */
export type ConversationState =
  | { kind: 'none' }
  | { kind: 'accepted'; conversationId: string }
  | { kind: 'pendingOutgoing'; conversationId: string }
  | { kind: 'pendingIncoming'; conversationId: string };

export type ActiveConversation = { userId: string } | null;
