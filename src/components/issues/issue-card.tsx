'use client';

import { memo } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { Mic, GripVertical } from 'lucide-react';
import { IssueStatusControl } from './issue-status-control';
import { EditIssueDialog } from './edit-issue-dialog';
import { DeleteIssueButton } from './delete-issue-button';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_at: string;
  created_by: string;
  voiceSignedUrl: string | null;
  reporter: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
};

/**
 * - `default` — the card sitting in its own status column.
 * - `preview` — the *provisional* placement rendered inside the column the
 *   pointer is currently over, before the drop actually happens. Still the
 *   real draggable (same id, so dnd-kit keeps a mounted active node the whole
 *   drag), just drawn as a dashed placeholder.
 * - `overlay` — the copy inside `<DragOverlay>` that follows the cursor.
 */
export type IssueCardVariant = 'default' | 'preview' | 'overlay';

function IssueCardImpl({
  issue,
  onRequestDelete,
  readOnly = false,
  variant = 'default',
}: {
  issue: Issue;
  /** The board owns the mutation + optimistic remove/restore, the same way
   * it already does for drag-and-drop status changes. */
  onRequestDelete: (issue: Issue) => void;
  /** A non-CEO viewer sees their own reported issues but can't act on them —
   * no drag handle, no edit/delete, no status control. */
  readOnly?: boolean;
  variant?: IssueCardVariant;
}) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const isOverlay = variant === 'overlay';
  const isPreview = variant === 'preview';
  // Only the CEO manages the board; a non-CEO viewer gets a read-only card.
  // The overlay copy must never register under the real card's id — that
  // would be a second draggable for the same issue — so it takes a suffixed,
  // permanently disabled registration instead.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: isOverlay ? `${issue.id}__overlay` : issue.id,
    disabled: readOnly || isOverlay,
  });

  return (
    // No transform here on purpose: the <DragOverlay> copy is what follows the
    // cursor, so translating this node too would show the card twice.
    <div ref={setNodeRef}>
      <motion.div
        layout={!isDragging && !isOverlay}
        initial={isOverlay ? false : { opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={isDragging || isOverlay ? undefined : { scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          GLASS_CARD,
          'flex flex-col gap-3 p-6',
          isDragging && !isPreview && 'opacity-40',
          isPreview && 'opacity-60 border-2 border-dashed border-white/70',
          isOverlay && 'cursor-grabbing shadow-2xl ring-2 ring-white/40',
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 flex-1 font-medium break-words [overflow-wrap:anywhere]">{issue.title}</span>
          {!readOnly && (
            <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
              <div className="flex gap-1">
                <EditIssueDialog issue={{ id: issue.id, title: issue.title, description: issue.description }} />
                <DeleteIssueButton onConfirm={() => onRequestDelete(issue)} />
              </div>
              <button
                type="button"
                {...listeners}
                {...attributes}
                aria-label={t('dragHandle')}
                className="cursor-grab touch-none rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </button>
            </div>
          )}
        </div>
        {issue.description && <p className="text-sm text-white/70">{issue.description}</p>}
        {issue.voiceSignedUrl && (
          <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
            <Mic className="size-4 shrink-0 text-white/70" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] font-medium text-white/70">{t('voiceNote')}</span>
              <audio controls preload="none" src={issue.voiceSignedUrl} className="h-8 w-full" />
            </div>
          </div>
        )}
        <div className="flex flex-col gap-1 text-xs text-white/60">
          {issue.reporter && (
            <span>
              {t('table.reporter')}: {issue.reporter.first_name} {issue.reporter.last_name}
            </span>
          )}
          <span>
            {issue.assignee
              ? `${t('assignee')}: ${issue.assignee.first_name} ${issue.assignee.last_name}`
              : t('noAssignee')}
          </span>
          <span>{format.dateTime(new Date(issue.created_at), { dateStyle: 'medium' })}</span>
        </div>
        {!readOnly && <IssueStatusControl status={issue.status} />}
      </motion.div>
    </div>
  );
}

export const IssueCard = memo(IssueCardImpl);
