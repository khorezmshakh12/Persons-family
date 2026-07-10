'use client';

import { memo } from 'react';
import { useTranslations, useFormatter } from 'next-intl';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Mic, GripVertical } from 'lucide-react';
import { IssueStatusControl } from './issue-status-control';
import { GLASS_CARD } from '@/lib/glass';
import { cn } from '@/lib/utils';

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'done';
  created_at: string;
  voiceSignedUrl: string | null;
  reporter: { first_name: string; last_name: string } | null;
  assignee: { first_name: string; last_name: string } | null;
};

function IssueCardImpl({ issue, isAdmin }: { issue: Issue; isAdmin: boolean }) {
  const t = useTranslations('issues');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: issue.id,
    disabled: !isAdmin,
  });

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      className={cn(GLASS_CARD, 'flex flex-col gap-3 p-6', isDragging && 'opacity-40')}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{issue.title}</span>
        {isAdmin && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={t('dragHandle')}
            className="-mt-1 -mr-1 shrink-0 cursor-grab touch-none rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/80 active:cursor-grabbing"
          >
            <GripVertical className="size-4" />
          </button>
        )}
      </div>
      {issue.description && <p className="text-sm text-white/70">{issue.description}</p>}
      {issue.voiceSignedUrl && (
        <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
          <Mic className="size-4 shrink-0 text-teal-300" />
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
      <IssueStatusControl issueId={issue.id} status={issue.status} readOnly={!isAdmin} />
    </div>
  );
}

export const IssueCard = memo(IssueCardImpl);
