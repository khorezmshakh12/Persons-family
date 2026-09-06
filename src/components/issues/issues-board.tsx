'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { updateIssueStatusAction, deleteIssueAction, getVisibleIssuesAction } from '@/lib/actions/issues';
import { ensureRealtimeSignedIn, getRealtimeDb } from '@/lib/firebase/client';
import { KanbanColumn } from './kanban-column';
import type { Issue } from './issue-card';

const COLUMNS: Issue['status'][] = ['open', 'in_progress', 'done'];

// Issues is CEO-exclusive (the page 404s for everyone else), so there is no
// per-viewer capability left to thread through the board: the viewer can
// always drag, edit and delete every card.
export function IssuesBoard({ issues: initialIssues }: { issues: Issue[] }) {
  const t = useTranslations('issues');
  const [issues, setIssues] = useState(initialIssues);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
    if (!over) return;

    const issueId = String(active.id);
    const nextStatus = over.id as Issue['status'];
    const current = issues.find((i) => i.id === issueId);
    if (!current || current.status === nextStatus) return;

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            label={t(`columns.${status}`)}
            issues={issues.filter((issue) => issue.status === status)}
            emptyLabel={t('noIssuesInColumn')}
            onRequestDelete={handleRequestDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
