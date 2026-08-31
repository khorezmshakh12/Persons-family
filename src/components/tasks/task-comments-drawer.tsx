'use client';

import { useActionState, useCallback, useOptimistic, useRef, useState, useTransition } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, MessageCircle, Send, Trash2 } from 'lucide-react';
import {
  createTaskCommentAction,
  deleteTaskCommentAction,
  getTaskCommentsAction,
  type TaskComment,
  type TaskCommentActionState,
} from '@/lib/actions/task-comments';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function TaskCommentsDrawer({
  taskId,
  taskTitle,
  currentUserId,
  canComment,
  commentCount = 0,
}: {
  taskId: string;
  taskTitle: string;
  currentUserId: string;
  /** CEO, the assignee, or the assigner — the server re-checks this. */
  canComment: boolean;
  /** Server-rendered count for the closed trigger; the loaded list replaces it once opened. */
  commentCount?: number;
}) {
  const t = useTranslations('tasks');
  const format = useFormatter();

  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  // Relative timestamps need a "now" to count back from, and reading the
  // clock during render is impure — it's sampled when the drawer opens
  // instead, which is the only moment the list becomes visible anyway.
  const [now, setNow] = useState(0);
  const [deletePending, startDeleteTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // A board can hold dozens of cards and almost none of their threads get
  // opened, so comments are fetched on open rather than shipped with every
  // task row. Called from the open handler and after each write — never
  // from an effect, so there is no cascading-render round trip.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getTaskCommentsAction(taskId);
      setComments(rows);
      setLoaded(true);
    } catch (error) {
      console.error('task comments load failed', error);
      toast.error(t('errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setNow(Date.now());
      void refresh();
    }
  }

  const [optimisticComments, addOptimisticComment] = useOptimistic(
    comments,
    (state, newComment: TaskComment) => [...state, newComment],
  );

  async function composedAction(prevState: TaskCommentActionState, formData: FormData) {
    const text = formData.get('body');
    if (typeof text === 'string' && text.trim()) {
      addOptimisticComment({
        id: `optimistic-${Date.now()}`,
        body: text,
        created_at: new Date().toISOString(),
        author_id: currentUserId,
        authorName: '',
        authorAvatarUrl: null,
      });
    }
    const result = await createTaskCommentAction(prevState, formData);
    if (result?.error) {
      toast.error(t(`errors.${result.error}`));
    } else {
      formRef.current?.reset();
      await refresh();
    }
    return result;
  }

  const [, formAction, isPending] = useActionState<TaskCommentActionState, FormData>(
    composedAction,
    undefined,
  );

  function handleDelete(id: string) {
    const formData = new FormData();
    formData.set('id', id);
    // Optimistic removal first — the delete action returns void, so a
    // failure simply reappears on the next refresh.
    setComments((prev) => prev.filter((c) => c.id !== id));
    startDeleteTransition(async () => {
      await deleteTaskCommentAction(formData);
      await refresh();
    });
  }

  const count = loaded ? optimisticComments.length : commentCount;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('comments.title')}
            className="h-7 w-fit gap-1.5 rounded-full border-white/20 bg-white/5 px-3 text-xs text-white/70 hover:bg-white/15 hover:text-white"
          />
        }
      >
        <MessageCircle className="size-3.5" />
        {count}
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-4 border-white/20 bg-slate-900/95 text-white backdrop-blur-xl sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">{t('comments.title')}</SheetTitle>
          <p className="truncate text-xs text-white/50">{taskTitle}</p>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
          {loading && !loaded ? (
            <p className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="size-3.5 animate-spin" />
              {t('comments.loading')}
            </p>
          ) : optimisticComments.length === 0 ? (
            <p className="text-sm text-white/60">{t('comments.empty')}</p>
          ) : (
            optimisticComments.map((c) => {
              const isOptimistic = c.id.startsWith('optimistic-');
              return (
                <div
                  key={c.id}
                  className={`group flex items-start gap-2 ${isOptimistic ? 'opacity-60' : ''}`}
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarImage src={c.authorAvatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{c.authorName.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{c.authorName}</span>
                      <span className="text-[10px] text-white/50">
                        {format.relativeTime(new Date(c.created_at), now)}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-white/85">{c.body}</p>
                  </div>
                  {c.author_id === currentUserId && !isOptimistic && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      disabled={deletePending}
                      aria-label={t('comments.deleteComment')}
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
          <form
            ref={formRef}
            action={formAction}
            className="flex items-end gap-2 border-t border-white/15 p-4 pt-3"
          >
            <input type="hidden" name="taskId" value={taskId} />
            <Textarea
              name="body"
              rows={1}
              maxLength={2000}
              required
              placeholder={t('comments.placeholder')}
              className="min-h-9 flex-1 resize-none border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
            <Button type="submit" size="icon" disabled={isPending} aria-label={t('comments.send')}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        ) : (
          <p className="border-t border-white/15 p-4 pt-3 text-xs text-white/40 italic">
            {t('comments.viewOnly')}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
