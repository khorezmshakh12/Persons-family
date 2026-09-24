'use client';

import { useActionState, useMemo, useRef, useState } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, Loader2, MessageCircle, Send } from 'lucide-react';
import {
  addIssueCommentAction,
  type AddIssueCommentState,
  type IssueComment,
} from '@/lib/actions/issues';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CHIP_ACCENT, CHIP_INFO, CHIP_NEUTRAL } from '@/lib/glass';
import { cn } from '@/lib/utils';

const ROLE_CHIP: Record<IssueComment['authorRole'], string> = {
  ceo: CHIP_ACCENT,
  assignee: CHIP_INFO,
  author: CHIP_NEUTRAL,
  staff: CHIP_NEUTRAL,
};

/**
 * An issue's comment thread, inline under the card. Everyone who can see an
 * issue on the board may write here: the CEO sees (and comments on) every
 * issue, anyone else only sees the issues they raised or were assigned —
 * the exact set addIssueCommentAction re-checks server-side.
 *
 * The thread itself arrives with the board rows (getVisibleIssuesAction),
 * so the other party's comments show up on the board's live refresh. A
 * comment the viewer just sent is appended locally from the action's
 * result, so it appears immediately even before that refresh lands.
 */
export function IssueComments({
  issueId,
  comments,
  viewerIsCeo,
}: {
  issueId: string;
  comments: IssueComment[];
  viewerIsCeo: boolean;
}) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<IssueComment[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  // Server rows win; a locally-sent comment drops out once the refresh
  // brings it back under the same id.
  const thread = useMemo(() => {
    const ids = new Set(comments.map((c) => c.id));
    return [...comments, ...sent.filter((c) => !ids.has(c.id))];
  }, [comments, sent]);

  const last = thread.at(-1);
  // The prototype's "waiting for your reply" cue: the CEO spoke last on an
  // issue the viewer is part of.
  const awaitingReply = !viewerIsCeo && last?.authorRole === 'ceo';

  async function submit(prevState: AddIssueCommentState, formData: FormData) {
    const result = await addIssueCommentAction(prevState, formData);
    if (result?.error) {
      toast.error(t(`errors.${result.error}`));
    } else if (result?.comment) {
      const comment = result.comment;
      setSent((prev) => [...prev, comment]);
      formRef.current?.reset();
    }
    return result;
  }

  const [, formAction, isPending] = useActionState<AddIssueCommentState, FormData>(submit, undefined);

  return (
    <div className="flex flex-col gap-2 border-t border-au-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-au-line bg-au-card-2 px-3 text-xs text-au-muted transition-colors hover:text-au-ink"
        >
          <MessageCircle className="size-3.5" />
          {t('comments.toggle', { count: thread.length })}
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {awaitingReply && <span className={CHIP_ACCENT}>{t('comments.awaitingReply')}</span>}
      </div>

      {open && (
        <div className="flex flex-col gap-3">
          {thread.length === 0 ? (
            <p className="text-xs text-au-muted">{t('comments.empty')}</p>
          ) : (
            <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto">
              {thread.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'flex flex-col gap-1 rounded-xl border border-au-line px-3 py-2',
                    c.authorRole === 'ceo' ? 'bg-au-accent-soft' : 'bg-au-card-2',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-semibold text-au-ink">{c.authorName}</span>
                    <span className={ROLE_CHIP[c.authorRole]}>{t(`comments.roles.${c.authorRole}`)}</span>
                    <span className="text-[11px] text-au-muted">
                      {format.dateTime(new Date(c.created_at), { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-au-ink break-words [overflow-wrap:anywhere]">
                    {c.body}
                  </p>
                </li>
              ))}
            </ol>
          )}

          <form ref={formRef} action={formAction} className="flex items-end gap-2">
            <input type="hidden" name="issueId" value={issueId} />
            <Textarea
              name="body"
              rows={2}
              maxLength={2000}
              required
              placeholder={viewerIsCeo ? t('comments.placeholderCeo') : t('comments.placeholderReply')}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              className="min-h-9 flex-1 resize-none border-au-line bg-au-card text-sm text-au-ink placeholder:text-au-faint"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isPending}
              aria-label={viewerIsCeo ? t('comments.sendComment') : t('comments.sendReply')}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
          <p className="text-[11px] text-au-faint">{t('comments.hint')}</p>
        </div>
      )}
    </div>
  );
}
