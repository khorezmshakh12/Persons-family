'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Mic, Paperclip, Send, Square, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  requestChatMediaReadUrlAction,
  requestChatMediaUploadUrlAction,
  sendStaffChatAction,
  type StaffChatsActionState,
  type SentStaffChatMessage,
} from '@/lib/actions/staff-chats';
import { CHAT_MEDIA_MAX_FILE_BYTES, mediaTypeForMime, type ChatMediaType } from '@/lib/chat-media';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatQuote } from './types';

// Not a heavy dependency on its own (a static emoji grid, no third-party
// picker library — see emoji-picker.tsx's own comment on that), but every
// byte deferred out of the initial chat bundle is still a byte deferred;
// most people load /chat to read/send text, not to pick an emoji.
const EmojiPicker = dynamic(() => import('./emoji-picker').then((mod) => mod.EmojiPicker), {
  ssr: false,
});

export function ChatComposer({
  receiverId,
  onOptimisticSend,
  onConfirmedSend,
  replyTarget,
  onClearReply,
}: {
  /** null for Family Chat. */
  receiverId: string | null;
  onOptimisticSend: (partial: {
    messageText?: string;
    mediaUrl?: string;
    mediaType?: ChatMediaType;
    replyToId?: string;
  }) => void;
  /** Commits the server-confirmed row into real state immediately, instead
   * of waiting on the Realtime INSERT echo — see the comment on
   * sendStaffChatAction for why that round trip alone let the optimistic
   * bubble flicker away before being replaced. */
  onConfirmedSend: (message: SentStaffChatMessage) => void;
  /** Set by MessageBubble's Reply button (via ConversationView); rendered
   * here as a quoted preview above the input, same placement Telegram uses. */
  replyTarget: ChatQuote | null;
  onClearReply: () => void;
}) {
  const t = useTranslations('chatHub');
  const [text, setText] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Releases the microphone if this composer unmounts mid-recording (e.g.
  // navigating away from /chat, or switching conversations if this
  // component gets remounted) — without this, the mic stays active
  // indefinitely with no visible indication to the user.
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function composedAction(prevState: StaffChatsActionState, formData: FormData) {
    const messageText = formData.get('messageText');
    const trimmed = typeof messageText === 'string' ? messageText.trim() : '';
    if (trimmed) onOptimisticSend({ messageText: trimmed, replyToId: replyTarget?.id });
    return sendStaffChatAction(prevState, formData);
  }

  const [state, formAction, isPending] = useActionState<StaffChatsActionState, FormData>(
    composedAction,
    undefined,
  );

  useEffect(() => {
    if (!state) return;
    if (state.error) {
      toast.error(t(`errors.${state.error}`));
    } else {
      if (state.message) onConfirmedSend(state.message);
      setText('');
      formRef.current?.reset();
      onClearReply();
    }
    // onConfirmedSend/onClearReply are fresh closures from the parent every
    // render — only `state` (and `t` for the toast copy) should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, t]);

  async function uploadAndSend(file: File, mediaType: ChatMediaType) {
    if (file.size > CHAT_MEDIA_MAX_FILE_BYTES) {
      toast.error(t('errors.fileTooLarge'));
      return;
    }
    setIsUploading(true);
    try {
      const uploadUrlResult = await requestChatMediaUploadUrlAction(file.name);
      if (uploadUrlResult.error || !uploadUrlResult.path || !uploadUrlResult.token) {
        toast.error(t(`errors.${uploadUrlResult.error ?? 'uploadFailed'}`));
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('chat_media')
        .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, file, {
          contentType: file.type,
        });
      if (uploadError) {
        toast.error(t('errors.uploadFailed'));
        return;
      }

      const readUrlResult = await requestChatMediaReadUrlAction(uploadUrlResult.path);
      if (readUrlResult.error || !readUrlResult.signedUrl) {
        toast.error(t('errors.uploadFailed'));
        return;
      }

      onOptimisticSend({
        mediaUrl: readUrlResult.signedUrl,
        mediaType,
        replyToId: replyTarget?.id,
      });

      const sendFormData = new FormData();
      if (receiverId) sendFormData.set('receiverId', receiverId);
      sendFormData.set('mediaUrl', readUrlResult.signedUrl);
      sendFormData.set('mediaType', mediaType);
      if (replyTarget) sendFormData.set('replyToId', replyTarget.id);
      const result = await sendStaffChatAction(undefined, sendFormData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
      } else if (result?.message) {
        onConfirmedSend(result.message);
        onClearReply();
      }
    } finally {
      setIsUploading(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaType = mediaTypeForMime(file.type);
    if (mediaType === 'none') {
      toast.error(t('errors.invalidFileType'));
      return;
    }
    uploadAndSend(file, mediaType);
  }

  async function handleToggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        await uploadAndSend(file, 'voice');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error(t('errors.micDenied'));
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-2 border-t border-white/15 p-4"
    >
      {receiverId && <input type="hidden" name="receiverId" value={receiverId} />}
      {replyTarget && <input type="hidden" name="replyToId" value={replyTarget.id} />}
      {replyTarget && (
        <div className="flex items-center gap-2 rounded-lg border-l-2 border-teal-300 bg-white/10 px-3 py-1.5">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xs font-medium text-teal-200">{replyTarget.senderName}</span>
            <span className="truncate text-xs text-white/60">
              {replyTarget.text ?? t(`mediaLabel.${replyTarget.mediaType}`)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            aria-label={t('cancelReply')}
            className="shrink-0 text-white/50 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {isRecording && (
        <div className="flex items-center gap-2 text-xs text-red-300">
          <span className="size-2 animate-pulse rounded-full bg-red-400" aria-hidden />
          {t('recording')}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading || isRecording}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || isRecording}
          aria-label={t('attach')}
          className="shrink-0 text-white/70 hover:text-white"
        >
          <Paperclip className="size-5" />
        </Button>
        <EmojiPicker onSelect={(emoji) => setText((v) => v + emoji)} />
        <Textarea
          name="messageText"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          rows={1}
          maxLength={2000}
          disabled={isUploading || isRecording}
          className="min-h-10 flex-1 resize-none border-white/20 bg-white/10 text-white placeholder:text-white/40"
        />
        <Button
          type="button"
          variant={isRecording ? 'destructive' : 'ghost'}
          size="icon"
          onClick={handleToggleRecording}
          disabled={isUploading}
          aria-label={isRecording ? t('stopRecording') : t('recordVoice')}
          className={isRecording ? 'shrink-0' : 'shrink-0 text-white/70 hover:text-white'}
        >
          {isRecording ? <Square className="size-4" /> : <Mic className="size-5" />}
        </Button>
        <Button
          type="submit"
          size="icon"
          disabled={isPending || isUploading || isRecording || !text.trim()}
          aria-label={t('send')}
          className="shrink-0"
        >
          {isPending || isUploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </form>
  );
}
