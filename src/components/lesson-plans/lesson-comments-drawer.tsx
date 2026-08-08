'use client';

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import {
  createLessonCommentAction,
  deleteLessonCommentAction,
  type LessonActionState,
} from '@/lib/actions/course-lessons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export type LessonCommentRole = 'ceo' | 'admin_manager' | 'assistant' | 'teacher';

export type LessonComment = {
  id: string;
  comment_text: string;
  created_at: string;
  user_id: string;
  authorName: string;
  authorRole: LessonCommentRole;
};

export function LessonCommentsDrawer({
  lessonId,
  lessonNumber,
  comments,
  currentUserId,
  viewerName,
  canComment,
}: {
  lessonId: string;
  lessonNumber: number;
  comments: LessonComment[];
  currentUserId: string;
  viewerName: string;
  canComment: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (state, newComment: LessonComment) => [...state, newComment],
  );

  async function composedAction(prevState: LessonActionState, formData: FormData) {
    const text = formData.get('commentText');
    if (typeof text === 'string' && text.trim()) {
      addOptimisticComment({
        id: `optimistic-${Date.now()}`,
        comment_text: text,
        created_at: new Date().toISOString(),
        user_id: currentUserId,
        authorName: viewerName,
        authorRole: 'ceo',
      });
    }
    return createLessonCommentAction(prevState, formData);
  }

  const [state, formAction, isPending] = useActionState<LessonActionState, FormData>(composedAction, undefined);
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
      deleteLessonCommentAction(formData);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 rounded-full border-white/20 bg-white/5 px-3 text-xs text-white/70 hover:bg-white/15 hover:text-white"
          />
        }
      >
        <MessageCircle className="size-3.5" />
        {comments.length}
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4 border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">{t('courseLessons.commentsTitle', { number: lessonNumber })}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {optimisticComments.length === 0 ? (
            <p className="text-sm text-white/60">{t('courseLessons.noComments')}</p>
          ) : (
            optimisticComments.map((c) => {
              const isOptimistic = c.id.startsWith('optimistic-');
              return (
                <div key={c.id} className={`group flex items-start gap-2 ${isOptimistic ? 'opacity-60' : ''}`}>
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback>{c.authorName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{c.authorName}</span>
                      <span className="text-[10px] text-white/50">
                        {format.dateTime(new Date(c.created_at), { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-white/85">{c.comment_text}</p>
                  </div>
                  {c.user_id === currentUserId && !isOptimistic && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletePending}
                      aria-label={t('courseLessons.deleteComment')}
                      className="tap-scale shrink-0 text-white/40 opacity-100 transition-opacity hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {canComment ? (
          <form ref={formRef} action={formAction} className="flex items-end gap-2 border-t border-white/15 p-4 pt-3">
            <input type="hidden" name="lessonId" value={lessonId} />
            <Textarea
              name="commentText"
              rows={1}
              maxLength={1000}
              required
              placeholder={t('courseLessons.commentPlaceholder')}
              className="min-h-9 flex-1 resize-none border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
            <Button type="submit" size="icon" disabled={isPending} aria-label={t('courseLessons.send')}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        ) : (
          <p className="border-t border-white/15 p-4 pt-3 text-xs text-white/40 italic">
            {t('courseLessons.viewOnly')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
