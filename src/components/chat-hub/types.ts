import type { ChatMediaType } from '@/lib/chat-media';
import type { StaffRole } from '@/lib/nav';

export type StaffChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message_text: string | null;
  media_url: string | null;
  media_type: ChatMediaType;
  pinned_at: string | null;
  created_at: string;
  is_read: boolean;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
};

export type ChatQuote = { id: string; senderName: string; text: string | null; mediaType: ChatMediaType };

export type StaffDirectoryEntry = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: StaffRole;
};

export type ActiveConversation = { type: 'family' } | { type: 'dm'; userId: string };
