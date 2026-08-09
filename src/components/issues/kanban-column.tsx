'use client';

import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { IssueCard, type Issue } from './issue-card';

function KanbanColumnImpl({
  status,
  label,
  issues,
  isAdmin,
  currentUserId,
  emptyLabel,
  onRequestDelete,
}: {
  status: Issue['status'];
  label: string;
  issues: Issue[];
  isAdmin: boolean;
  currentUserId: string;
  emptyLabel: string;
  onRequestDelete: (issue: Issue) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-2 transition-colors',
        isOver && 'bg-white/10 ring-2 ring-white/40',
      )}
    >
      <h2 className="text-sm font-medium text-white">
        {label} ({issues.length})
      </h2>
      <div className="flex flex-col gap-3">
        {issues.length === 0 ? (
          <p className="text-sm text-white/60">{emptyLabel}</p>
        ) : (
          issues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onRequestDelete={onRequestDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// A card moving within/into one column re-renders only that column — the
// other two columns' subtrees are skipped entirely, which is what actually
// makes the drag feel instant on a board with many cards.
export const KanbanColumn = memo(KanbanColumnImpl);
