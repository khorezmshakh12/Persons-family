'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { sendStaffChatMessageAction, type StaffChatActionState } from '@/lib/actions/staff-chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function StaffMessageComposer({ conversationId }: { conversationId: string }) {
  const t = useTranslations('staffChat');
  const [state, formAction, isPending] = useActionState<StaffChatActionState, FormData>(
    sendStaffChatMessageAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state && !state.error) {
      formRef.current?.reset();
      textareaRef.current?.focus();
    }
  }, [state]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 border-t border-white/15 pt-3">
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          name="content"
          placeholder={t('placeholder')}
          className="min-h-9 flex-1 resize-none border-white/20 bg-white/10 text-white placeholder:text-white/40"
          rows={1}
          maxLength={2000}
          onKeyDown={handleKeyDown}
          required
        />
        <Button type="submit" size="icon" disabled={isPending} aria-label={t('send')}>
          <Send className="size-4" />
        </Button>
      </div>
      {state?.error && <p className="text-sm text-red-300">{t(`errors.${state.error}`)}</p>}
    </form>
  );
}
