'use client';

import { memo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IssueCard, type Issue } from './issue-card';
import { springs, fadeInUp, staggerContainer } from '@/lib/motion';

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
  const shouldReduce = useReducedMotion();

  // A collapsed column still accepts a drop, but the drop would land out of
  // sight — so a card hovering here opens it, and it stays open so the card
  // is still visible once the drop lands.
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
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/15 hover:border-white/30 min-w-0 tap-scale"
          >
            <span className="font-semibold truncate">
              {label} · {issues.length}
            </span>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={shouldReduce ? { duration: 0 } : springs.gentle}
              className="shrink-0 text-white/70"
            >
              <ChevronDown className="size-4" />
            </motion.div>
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
            transition={shouldReduce ? { duration: 0 } : springs.gentle}
            className="flex flex-col gap-3 min-w-0 w-full overflow-hidden"
          >
            {issues.length === 0 ? (
              <p className="text-sm text-white/60 px-2 py-2">{emptyLabel}</p>
            ) : (
              <motion.div
                variants={shouldReduce ? undefined : staggerContainer}
                initial={shouldReduce ? false : "initial"}
                animate="animate"
                className="flex flex-col gap-3 min-w-0 w-full"
              >
                {issues.map((issue) => (
                  <motion.div key={issue.id} variants={shouldReduce ? undefined : fadeInUp}>
                    <IssueCard
                      issue={issue}
                      readOnly={readOnly}
                      onRequestDelete={onRequestDelete}
                      variant={issue.id === previewIssueId ? 'preview' : 'default'}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export const KanbanColumn = memo(KanbanColumnImpl);
