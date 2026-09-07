'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { updateIssueStatusAction, deleteIssueAction, getVisibleIssuesAction } from '@/lib/actions/issues';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { KanbanColumn } from './kanban-column';
import { IssueCard, type Issue } from './issue-card';

const COLUMNS: Issue['status'][] = ['open', 'in_progress', 'done'];

// The board is CEO-managed: only the CEO can drag, edit or delete a card.
// A non-CEO viewer gets the same three columns but read-only — no drag
// handles, no edit/delete buttons, no status control — via `readOnly`.
export function IssuesBoard({
  issues: initialIssues,
  readOnly = false,
}: {
  issues: Issue[];
  readOnly?: boolean;
}) {
  const t = useTranslations('issues');
  const [issues, setIssues] = useState(initialIssues);
  // Live-drag state. Neither of these touches `issues` — the real move still
  // only happens in handleDragEnd — they just drive where the card is
  // *rendered* while the pointer is still down.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<Issue['status'] | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const activeIssue = activeId ? (issues.find((i) => i.id === activeId) ?? null) : null;

  // Split once per `issues` change so a drag-over below only has to rebuild
  // the two columns it actually affects — the other column keeps its array
  // identity and stays skipped by KanbanColumn's memo.
  const baseColumns = useMemo(() => {
    const map = new Map<Issue['status'], Issue[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const issue of issues) map.get(issue.status)?.push(issue);
    return map;
  }, [issues]);

  // Provisional placement: while the pointer is over a column the card
  // doesn't belong to yet, render it there (and out of its home column).
  const { columns, previewStatus } = useMemo(() => {
    if (!activeIssue || !overStatus || activeIssue.status === overStatus) {
      return { columns: baseColumns, previewStatus: null };
    }
    const next = new Map(baseColumns);
    next.set(
      activeIssue.status,
      (baseColumns.get(activeIssue.status) ?? []).filter((i) => i.id !== activeIssue.id),
    );
    next.set(overStatus, [...(baseColumns.get(overStatus) ?? []), activeIssue]);
    return { columns: next, previewStatus: overStatus };
  }, [baseColumns, activeIssue, overStatus]);

  // `over.id` is a column droppable id, but resolve through the cards too so
  // a stray id can never be written to the database as a status.
  function resolveStatus(overId: string | number | undefined | null): Issue['status'] | null {
    if (overId == null) return null;
    const id = String(overId);
    if ((COLUMNS as string[]).includes(id)) return id as Issue['status'];
    return issues.find((issue) => issue.id === id)?.status ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setOverStatus(null);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStatus(resolveStatus(event.over?.id));
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverStatus(null);
  }

  // Board used to only reflect the viewer's own drag/delete actions — an
  // issue someone else reported or reassigned while this page was open
  // never appeared until a manual refresh. board_signals/issues (bumped by
  // every mutating issues.ts action) carries no row payload, so every fire
  // re-fetches the whole board via getVisibleIssuesAction — which re-checks
  // CEO itself and applies the same recency rule as the page. This
  // also fixes a real gap the old Realtime handler had: voice notes now get
  // a proper signed URL on every refresh instead of staying null until the
  // next full page load (signing needs the server, which this Server
  // Action now is).
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const refresh = async () => {
      const rows = await getVisibleIssuesAction();
      if (!cancelled) setIssues(rows);
    };

    ensureRealtimeSignedIn()
      .then(() => {
        if (cancelled) return;
        unsubscribe = onSnapshot(doc(getRealtimeDb(), 'board_signals', 'issues'), () => refresh());
      })
      .catch((error) => console.error('issues board realtime sign-in failed', error));

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Drop the provisional placement first: from here on the card's position
    // comes from `issues` itself (optimistically below), so the two never
    // both claim the move.
    setActiveId(null);
    setOverStatus(null);
    if (!over) return;

    const issueId = String(active.id);
    const nextStatus = resolveStatus(over.id);
    const current = issues.find((i) => i.id === issueId);
    if (!nextStatus || !current || current.status === nextStatus) return;

    const previousIssues = issues;
    // Strict optimistic UI: the card jumps to its new column immediately,
    // the database round trip happens in the background. Only a failure
    // reverts the local state — the common case never waits on the network.
    setIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, status: nextStatus } : i)));

    (async () => {
      const formData = new FormData();
      formData.set('id', issueId);
      formData.set('status', nextStatus);
      const result = await updateIssueStatusAction(formData);
      if (result?.error) {
        setIssues(previousIssues);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  // Same optimistic pattern as the drag handler: remove immediately, put it
  // back and surface a toast only if the delete actually fails.
  function handleRequestDelete(issue: Issue) {
    const previousIssues = issues;
    setIssues((prev) => prev.filter((i) => i.id !== issue.id));

    (async () => {
      const formData = new FormData();
      formData.set('id', issue.id);
      const result = await deleteIssueAction(formData);
      if (result?.error) {
        setIssues(previousIssues);
        toast.error(t(`errors.${result.error}`));
      }
    })();
  }

  if (issues.length === 0) {
    return <p className="text-sm text-white/70">{t('noIssues')}</p>;
  }

  return (
    <DndContext
      sensors={sensors}
      // The provisional placement reflows both columns mid-drag, so the
      // droppable rects captured at drag start go stale immediately.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-3">
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            label={t(`columns.${status}`)}
            issues={columns.get(status) ?? []}
            emptyLabel={t('noIssuesInColumn')}
            readOnly={readOnly}
            onRequestDelete={handleRequestDelete}
            previewIssueId={previewStatus === status ? activeId : null}
            collapsible={true}
            defaultExpanded={status !== 'done'}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeIssue ? (
          <IssueCard
            issue={activeIssue}
            readOnly={readOnly}
            onRequestDelete={handleRequestDelete}
            variant="overlay"
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
