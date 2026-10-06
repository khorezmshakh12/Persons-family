'use client';

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, Trash2, Pencil } from 'lucide-react';
import {
  createLessonCommentAction,
  deleteLessonCommentAction,
  updateLessonCommentAction,
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
  locked = false,
}: {
  lessonId: string;
  lessonNumber: number;
  comments: LessonComment[];
  currentUserId: string;
  viewerName: string;
  canComment: boolean;
  /** The lesson's month is closed: its discussion is part of that finished
   * record, so deleting your own comment is off the table too (the same rule
   * deleteLessonCommentAction enforces server-side). Reading stays open. */
  locked?: boolean;
}) {
  const t = useTranslations('lessonPlans');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [isEditPending, startEditTransition] = useTransition();

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

  function startEdit(commentId: string, currentText: string) {
    setEditingId(commentId);
    setEditDraft(currentText);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  function saveEdit(commentId: string) {
    const text = editDraft.trim();
    if (!text) return;
    const formData = new FormData();
    formData.set('id', commentId);
    formData.set('body', text);
    startEditTransition(async () => {
      const res = await updateLessonCommentAction(undefined, formData);
      if (res?.error) {
        toast.error(t(`errors.${res.error}`));
      } else {
        cancelEdit();
      }
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
            className="h-7 gap-1.5 rounded-full border-au-line bg-au-card-2 px-3 text-xs text-au-muted hover:bg-au-card-2 hover:text-au-ink"
          />
        }
      >
        <MessageCircle className="size-3.5" />
        {comments.length}
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4 border-au-line bg-au-card text-au-ink sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-au-ink">{t('courseLessons.commentsTitle', { number: lessonNumber })}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {optimisticComments.length === 0 ? (
            <p className="text-sm text-au-muted">{t('courseLessons.noComments')}</p>
          ) : (
            optimisticComments.map((c) => {
              const isOptimistic = c.id.startsWith('optimistic-');
              const isEditing = editingId === c.id;
              return (
                <div key={c.id} className={`group flex items-start gap-2 ${isOptimistic ? 'opacity-60' : ''}`}>
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback>{c.authorName[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{c.authorName}</span>
                      <span className="text-[10px] text-au-muted">
                        {format.dateTime(new Date(c.created_at), { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <textarea
                          autoFocus
                          value={editDraft}
                          maxLength={1000}
                          rows={Math.min(4, Math.max(2, editDraft.split(/\n/).length))}
                          onChange={(e) => setEditDraft(e.target.value)}
                          className="min-h-8 w-full resize-none rounded-lg border border-au-line bg-au-card px-2 py-1.5 text-sm text-au-ink outline-none focus:border-au-accent"
                        />
                        <span className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md px-2 py-0.5 text-xs font-semibold text-au-muted hover:text-au-ink"
                          >
                            Bekor
                          </button>
                          <button
                            type="button"
                            onClick={() => saveEdit(c.id)}
                            disabled={isEditPending || !editDraft.trim()}
                            className="rounded-md bg-au-ink px-2.5 py-0.5 text-xs font-semibold text-au-card disabled:opacity-50"
                          >
                            Saqlash
                          </button>
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-au-ink">{c.comment_text}</p>
                    )}
                  </div>
                  {c.user_id === currentUserId && !isOptimistic && !locked && !isEditing && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(c.id, c.comment_text)}
                        disabled={isEditPending}
                        aria-label={t('courseLessons.editComment')}
                        className="tap-scale shrink-0 text-au-muted opacity-100 transition-opacity hover:text-au-ink sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={deletePending}
                        aria-label={t('courseLessons.deleteComment')}
                        className="tap-scale shrink-0 text-au-muted opacity-100 transition-opacity hover:text-au-ink sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {canComment ? (
          <form ref={formRef} action={formAction} className="flex items-end gap-2 border-t border-au-line p-4 pt-3">
            <input type="hidden" name="lessonId" value={lessonId} />
            <Textarea
              name="commentText"
              rows={1}
              maxLength={1000}
              required
              placeholder={t('courseLessons.commentPlaceholder')}
              className="min-h-9 flex-1 resize-none border-au-line bg-au-card text-au-ink placeholder:text-au-faint"
            />
            <Button type="submit" size="icon" disabled={isPending} aria-label={t('courseLessons.send')}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        ) : (
          <p className="border-t border-au-line p-4 pt-3 text-xs text-au-muted italic">
            {t('courseLessons.viewOnly')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
