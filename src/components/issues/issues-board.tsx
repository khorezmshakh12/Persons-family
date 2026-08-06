'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { updateIssueStatusAction, deleteIssueAction } from '@/lib/actions/issues';
import { createClient } from '@/lib/supabase/client';
import { KanbanColumn } from './kanban-column';
import type { Issue } from './issue-card';

const COLUMNS: Issue['status'][] = ['open', 'in_progress', 'done'];

export function IssuesBoard({
  issues: initialIssues,
  isAdmin,
  isAdminManager,
  currentUserId,
}: {
  issues: Issue[];
  isAdmin: boolean;
  /** Grants change-status on an issue currently assigned to this viewer,
   * even though they're not `isAdmin` — mirrors updateIssueStatusAction. */
  isAdminManager: boolean;
  currentUserId: string;
}) {
  const t = useTranslations('issues');
  const [issues, setIssues] = useState(initialIssues);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Board used to only reflect the viewer's own drag/delete actions — an
  // issue someone else reported or reassigned while this page was open
  // never appeared until a manual refresh. issues_select's RLS (is_admin()
  // OR reporter OR assignee) can't be expressed as a single-column Realtime
  // filter, so this subscribes with no filter and trusts Realtime's own RLS
  // enforcement to only deliver rows this user may see — same pattern
  // chat-hub-client.tsx already relies on. A changed/inserted row only
  // carries raw columns (no joined reporter/assignee names, no re-signed
  // voice URL), so each event re-fetches that one row with its joins
  // through the browser client instead of hand-rolling the join client-side.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function fetchAndUpsert(id: string) {
      const { data } = await supabase
        .from('issues')
        .select(
          'id, title, description, status, created_at, created_by, assigned_to, resolved_at, voice_url, reporter:profiles!issues_created_by_fkey(first_name, last_name), assignee:profiles!issues_assigned_to_fkey(first_name, last_name)',
        )
        .eq('id', id)
        .maybeSingle();
      if (!data || cancelled) return;
      const canChangeStatus = isAdmin || (isAdminManager && data.assigned_to === currentUserId);
      const issue: Issue = {
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        created_at: data.created_at,
        created_by: data.created_by,
        // Voice notes need the admin (service-role) client to sign, which
        // isn't available in the browser — a freshly live-inserted issue's
        // recording just won't play until the next full page load.
        voiceSignedUrl: null,
        reporter: data.reporter,
        assignee: data.assignee,
        canChangeStatus,
      };
      setIssues((prev) =>
        prev.some((i) => i.id === issue.id)
          ? prev.map((i) => (i.id === issue.id ? issue : i))
          : [issue, ...prev],
      );
    }

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel('issues_board')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'issues' }, (payload) => {
          fetchAndUpsert((payload.new as { id: string }).id);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'issues' }, (payload) => {
          fetchAndUpsert((payload.new as { id: string }).id);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'issues' }, (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setIssues((prev) => prev.filter((i) => i.id !== deletedId));
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [currentUserId, isAdmin, isAdminManager]);

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
            currentUserId={currentUserId}
            emptyLabel={t('noIssuesInColumn')}
            onRequestDelete={handleRequestDelete}
          />
        ))}
      </div>
    </DndContext>
  );
}
