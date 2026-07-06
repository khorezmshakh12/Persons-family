'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';
import { sendStaffChatMessageAction, type StaffChatActionState } from '@/lib/actions/staff-chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function StaffMessageComposer({
  conversationId,
  onOptimisticSend,
}: {
  conversationId: string;
  onOptimisticSend: (content: string) => void;
}) {
  const t = useTranslations('staffChat');

  async function composedAction(prevState: StaffChatActionState, formData: FormData) {
    const content = formData.get('content');
    if (typeof content === 'string' && content.trim()) onOptimisticSend(content);
    return sendStaffChatMessageAction(prevState, formData);
  }

  const [state, formAction, isPending] = useActionState<StaffChatActionState, FormData>(
    composedAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.error) {
      toast.error(t(`errors.${state.error}`));
    } else {
      formRef.current?.reset();
      textareaRef.current?.focus();
    }
  }, [state, t]);

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
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
      {state?.error && <p className="text-sm text-red-300">{t(`errors.${state.error}`)}</p>}
    </form>
  );
}
