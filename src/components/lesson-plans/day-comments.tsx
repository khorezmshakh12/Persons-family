'use client';

import { useActionState, useEffect, useOptimistic, useRef, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Trash2 } from 'lucide-react';
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
  viewerName,
  viewerRole,
  canComment,
}: {
  dayId: string;
  comments: Comment[];
  currentUserId: string;
  viewerName: string;
  viewerRole: CommentRole | 'teacher';
  canComment: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const [deletePending, startDeleteTransition] = useTransition();
  // The real list only updates once createCommentAction's revalidatePath
  // round-trips back through the server tree — useOptimistic shows the
  // comment the instant Send is clicked, then reconciles with the real row
  // (or reverts, on failure) once that settles.
  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (state, newComment: Comment) => [...state, newComment],
  );

  async function composedAction(prevState: CommentActionState, formData: FormData) {
    const text = formData.get('commentText');
    if (typeof text === 'string' && text.trim() && viewerRole !== 'teacher') {
      addOptimisticComment({
        id: `optimistic-${Date.now()}`,
        comment_text: text,
        created_at: new Date().toISOString(),
        user_id: currentUserId,
        authorName: viewerName,
        authorRole: viewerRole,
      });
    }
    return createCommentAction(prevState, formData);
  }

  const [state, formAction, isPending] = useActionState<CommentActionState, FormData>(
    composedAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.error) {
      toast.error(t(`errors.${state.error}`));
    } else {
      formRef.current?.reset();
    }
  }, [state, t]);

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
        const roleComments = optimisticComments.filter((c) => c.authorRole === tab.value);
        return (
          <TabsContent key={tab.value} value={tab.value} className="flex flex-col gap-2">
            {roleComments.length === 0 ? (
              <p className="text-xs text-white/50">{t('comments.noComments')}</p>
            ) : (
              roleComments.map((c) => {
                const isOptimistic = c.id.startsWith('optimistic-');
                return (
                  <div
                    key={c.id}
                    className={`group flex items-start justify-between gap-2 text-xs ${isOptimistic ? 'opacity-60' : ''}`}
                  >
                    <p>
                      <span className="font-semibold">{c.authorName}:</span>{' '}
                      <span className="text-white/80">{c.comment_text}</span>
                    </p>
                    {c.user_id === currentUserId && !isOptimistic && (
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
                );
              })
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
                  {isPending && <Loader2 className="size-3.5 animate-spin" />}
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
