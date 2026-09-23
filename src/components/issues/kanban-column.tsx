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
  previewIssueId = null,
  collapsible = true,
  defaultExpanded = true,
}: {
  status: Issue['status'];
  label: string;
  issues: Issue[];
  emptyLabel: string;
  readOnly: boolean;
  onRequestDelete: (issue: Issue) => void;
  /** Id of the card this column is only *provisionally* holding, because a
   * drag is hovering here and hasn't been dropped yet. Non-null on exactly
   * one column at a time — and it's the prop that lets `memo` know the
   * hovered column has to re-render mid-drag. */
  previewIssueId?: string | null;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [expanded, setExpanded] = useState(defaultExpanded);

  // A collapsed column still accepts a drop, but the drop would land out of
  // sight — so a card hovering here opens it, and it stays open so the card
  // is still visible once the drop lands. This is React's "adjust state
  // while rendering" pattern rather than an effect: it converges in one
  // extra render (the guard is false as soon as `expanded` is true) instead
  // of painting the collapsed column first and cascading a second commit.
  // The header toggle keeps working exactly as before — `isOver` is only
  // ever true mid-drag, when the button can't be clicked anyway.
  if (isOver && !expanded) setExpanded(true);

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
            // Height only on the way in — no `opacity: 0` in `initial`. A
            // collapsed column that a drag-over auto-opens would otherwise
            // mount its cards at opacity 0, and if that animation stalls the
            // cards you are dragging onto are invisible. Expanding from
            // height 0 with opacity untouched can only ever under-reveal,
            // never hide. Opacity stays on `exit` (leaving is safe).
            initial={{ height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="flex flex-col gap-3 min-w-0 w-full overflow-hidden"
          >
            {issues.length === 0 ? (
              <p className="text-sm text-white/60 px-2 py-2">{emptyLabel}</p>
            ) : (
              issues.map((issue) => (
                <IssueCard
                  key={issue.id}
                  issue={issue}
                  readOnly={readOnly}
                  onRequestDelete={onRequestDelete}
                  variant={issue.id === previewIssueId ? 'preview' : 'default'}
                />
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
