'use client';

import { memo } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  /** True for the CEO always, and for an Administrative Manager only when
   * this specific issue is assigned to them — see updateIssueStatusAction. */
  canChangeStatus: boolean;
};

function IssueCardImpl({
  issue,
  isAdmin,
  currentUserId,
  onRequestDelete,
}: {
  issue: Issue;
  isAdmin: boolean;
  currentUserId: string;
  /** The board owns the mutation + optimistic remove/restore, the same way
   * it already does for drag-and-drop status changes. */
  onRequestDelete: (issue: Issue) => void;
}) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const isOwn = issue.created_by === currentUserId;
  // isAdmin here means "CEO" (see IssuesPage) — an Administrative Manager
  // additionally gets drag-to-change-status on an issue assigned to them,
  // computed server-side into issue.canChangeStatus.
  const canDrag = isAdmin || issue.canChangeStatus;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    disabled: !canDrag,
  });

  return (
    <div ref={setNodeRef} style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}>
      <motion.div
        layout={!isDragging}
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={isDragging ? undefined : { scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6', isDragging && 'opacity-40')}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium">{issue.title}</span>
          <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1">
            {(isAdmin || isOwn) && (
              <div className="flex gap-1">
                <EditIssueDialog issue={{ id: issue.id, title: issue.title, description: issue.description }} />
                <DeleteIssueButton onConfirm={() => onRequestDelete(issue)} />
              </div>
            )}
            {canDrag && (
              <button
                type="button"
                {...listeners}
                {...attributes}
                aria-label={t('dragHandle')}
                className="cursor-grab touch-none rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 active:cursor-grabbing"
              >
                <GripVertical className="size-4" />
              </button>
            )}
          </div>
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
          {isAdmin && issue.reporter && (
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
        <IssueStatusControl status={issue.status} />
      </motion.div>
    </div>
  );
}

export const IssueCard = memo(IssueCardImpl);
