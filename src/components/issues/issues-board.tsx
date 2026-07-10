'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { updateIssueStatusAction, deleteIssueAction } from '@/lib/actions/issues';
import { KanbanColumn } from './kanban-column';
import type { Issue } from './issue-card';

const COLUMNS: Issue['status'][] = ['open', 'in_progress', 'done'];

export function IssuesBoard({ issues: initialIssues, isAdmin }: { issues: Issue[]; isAdmin: boolean }) {
  const t = useTranslations('issues');
  const [issues, setIssues] = useState(initialIssues);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const issueId = String(active.id);
    const nextStatus = over.id as Issue['status'];
    const current = issues.find((i) => i.id === issueId);
    if (!current || current.status === nextStatus) return;

    const previousIssues = issues;
    // Strict optimistic UI: the card jumps to its new column immediately,
    // the Supabase round trip happens in the background. Only a failure
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
            isAdmin={isAdmin}
            emptyLabel={t('noIssuesInColumn')}
            onRequestDelete={handleRequestDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
