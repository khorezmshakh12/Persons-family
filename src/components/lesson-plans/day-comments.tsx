'use client';

import { useActionState, useEffect, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { createCommentAction, deleteCommentAction, type CommentActionState } from '@/lib/actions/lesson-plan-comments';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export type CommentRole = 'ceo' | 'admin_manager' | 'assistant';

export type Comment = {
  id: string;
  comment_text: string;
  created_at: string;
  user_id: string;
  authorName: string;
  authorRole: CommentRole;
};

const ROLE_TABS: { value: CommentRole; labelKey: string }[] = [
  { value: 'ceo', labelKey: 'ceo' },
  { value: 'admin_manager', labelKey: 'admin' },
  { value: 'assistant', labelKey: 'ta' },
];

export function DayComments({
  dayId,
  comments,
  currentUserId,
  viewerRole,
  canComment,
}: {
  dayId: string;
  comments: Comment[];
  currentUserId: string;
  viewerRole: CommentRole | 'teacher';
  canComment: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [deletePending, startDeleteTransition] = useTransition();
  const [state, formAction, isPending] = useActionState<CommentActionState, FormData>(
    createCommentAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  function handleDelete(id: string) {
    const formData = new FormData();
    formData.set('id', id);
    startDeleteTransition(() => {
      deleteCommentAction(formData);
    });
  }

  return (
    <Tabs defaultValue="ceo" className="gap-2">
      <TabsList className="h-auto bg-white/10 p-0.5">
        {ROLE_TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="text-[11px] text-white/60 data-active:bg-white/20 data-active:text-white"
          >
            {t(`comments.roleTabs.${tab.labelKey}`)}
          </TabsTrigger>
        ))}
      </TabsList>
      {ROLE_TABS.map((tab) => {
        const roleComments = comments.filter((c) => c.authorRole === tab.value);
        return (
          <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-2">
            {roleComments.length === 0 ? (
              <p className="text-xs text-white/50">{t('comments.noComments')}</p>
            ) : (
              roleComments.map((c) => (
                <div key={c.id} className="group flex items-start justify-between gap-2 text-xs">
                  <p>
                    <span className="font-semibold">{c.authorName}:</span>{' '}
                    <span className="text-white/80">{c.comment_text}</span>
                  </p>
                  {c.user_id === currentUserId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletePending}
                      aria-label={t('comments.delete')}
                      className="shrink-0 text-white/40 opacity-0 transition-opacity group-hover:opacity-100 hover:text-white"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
              ))
            )}

            {viewerRole === tab.value && canComment ? (
              <form ref={formRef} action={formAction} className="flex items-center gap-2 pt-1">
                <input type="hidden" name="dayId" value={dayId} />
                <Textarea
                  name="commentText"
                  rows={1}
                  maxLength={1000}
                  required
                  placeholder={t('comments.placeholder')}
                  className="min-h-8 flex-1 resize-none border-white/20 bg-white/10 text-xs text-white placeholder:text-white/40"
                />
                <Button type="submit" size="sm" disabled={isPending}>
                  {t('comments.send')}
                </Button>
              </form>
            ) : viewerRole === tab.value && !canComment ? (
              <p className="text-[11px] text-white/40 italic">{t('comments.viewOnly')}</p>
            ) : null}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
