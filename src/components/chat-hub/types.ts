import type { ChatMediaType } from '@/lib/chat-media';

export type StaffChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string | null;
  message_text: string | null;
  media_url: string | null;
  media_type: ChatMediaType;
  pinned_at: string | null;
  created_at: string;
};

export type StaffDirectoryEntry = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  role: 'ceo' | 'admin_manager' | 'teacher' | 'assistant';
};

export type ActiveConversation = { type: 'family' } | { type: 'dm'; userId: string };
