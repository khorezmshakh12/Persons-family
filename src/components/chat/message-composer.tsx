'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Send } from 'lucide-react';
import { sendMessageAction, type ChatActionState } from '@/lib/actions/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function MessageComposer() {
  const t = useTranslations('chat');
  const [state, formAction, isPending] = useActionState<ChatActionState, FormData>(
    sendMessageAction,
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
    <form ref={formRef} action={formAction} className="flex flex-col gap-2 border-t p-4">
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          name="content"
          placeholder={t('placeholder')}
          className="min-h-10 flex-1 resize-none"
          rows={1}
          maxLength={2000}
          onKeyDown={handleKeyDown}
          required
        />
        <Button type="submit" size="icon" disabled={isPending} aria-label={t('send')}>
          <Send className="size-4" />
        </Button>
      </div>
      {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
    </form>
  );
}
