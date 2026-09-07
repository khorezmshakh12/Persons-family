'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IssueCard, type Issue } from './issue-card';

function KanbanColumnImpl({
  status,
  label,
  issues,
  emptyLabel,
  readOnly,
  onRequestDelete,
  collapsible = true,
  defaultExpanded = true,
}: {
  status: Issue['status'];
  label: string;
  issues: Issue[];
  emptyLabel: string;
  readOnly: boolean;
  onRequestDelete: (issue: Issue) => void;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(defaultExpanded);
  const showCards = !collapsible || expanded;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-1.5 sm:p-2 transition-colors min-w-0 w-full overflow-hidden',
        isOver && 'bg-white/10 ring-2 ring-white/40',
      )}
    >
      {collapsible ? (
        <h2>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/15 hover:border-white/30 min-w-0"
          >
            <span className="font-semibold truncate">
              {label} · {issues.length}
            </span>
            <ChevronDown
              className={cn('size-4 shrink-0 text-white/70 transition-transform duration-200', expanded && 'rotate-180')}
            />
          </button>
        </h2>
      ) : (
        <h2 className="text-sm font-semibold text-white px-1 truncate">
          {label} ({issues.length})
        </h2>
      )}

      <AnimatePresence initial={false}>
        {showCards && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col gap-3 min-w-0 w-full overflow-hidden"
          >
            {issues.length === 0 ? (
              <p className="text-sm text-white/60 px-2 py-2">{emptyLabel}</p>
            ) : (
              issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} readOnly={readOnly} onRequestDelete={onRequestDelete} />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// A card moving within/into one column re-renders only that column — the
// other two columns' subtrees are skipped entirely, which is what actually
// makes the drag feel instant on a board with many cards.
export const KanbanColumn = memo(KanbanColumnImpl);
