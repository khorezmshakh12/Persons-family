'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUSES, type StrategyTask, type TaskStatus } from '@/lib/strategy';
import { DueTag, PersonAvatar, PriorityChip, WsTag } from './bits';
import type { WorkspaceApi } from './strategy-workspace';

export function BoardView({
  api,
  tasks,
  onQuickAdd,
}: {
  api: WorkspaceApi;
  tasks: StrategyTask[];
  onQuickAdd: (title: string, status: TaskStatus) => Promise<boolean>;
}) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [landed, setLanded] = useState<string | null>(null);
  const [quick, setQuick] = useState<TaskStatus | null>(null);
  const [text, setText] = useState('');

  return (
    <div className="sx-board">
      {(Object.keys(STATUSES) as TaskStatus[]).map((k, ci) => {
        const list = tasks.filter((t) => t.status === k);
        return (
          <div
            key={k}
            className={cn('col sx-rise', over === k && 'over')}
            style={{ '--i': ci } as React.CSSProperties}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(k);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData('text/plain');
              if (id) {
                api.moveTask(id, k);
                setLanded(id);
              }
            }}
          >
            <div className="col-h">
              <span className="dot" style={{ background: STATUSES[k].c }} />
              <b>{STATUSES[k].n}</b>
              <span className="c tabular-nums">{list.length}</span>
              <button onClick={() => setQuick(k)} title="Qo'shish">
                <Plus className="size-4" />
              </button>
            </div>
            <div className="cards">
              {list.map((t, i) => {
                const who = t.assignee_id ? api.personById.get(t.assignee_id) : undefined;
                return (
                  <div
                    key={t.id}
                    role="button"
                    tabIndex={0}
                    draggable
                    className={cn('tc', t.status === 'done' && 'done', dragId === t.id && 'dragging', landed === t.id && 'drop')}
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(t.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                    onAnimationEnd={() => landed === t.id && setLanded(null)}
                    onClick={() => api.openTask(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && api.openTask(t.id)}
                  >
                    <div className="row">
                      <WsTag ws={t.workstream} />
                      <span className="flex-1" />
                      <PriorityChip priority={t.priority} />
                    </div>
                    <h4>{t.title}</h4>
                    <div className="row">
                      <PersonAvatar person={who} size={24} />
                      <span className="flex-1" />
                      <DueTag task={t} today={api.today} />
                    </div>
                    {t.status !== 'done' && t.progress > 0 && (
                      <div className="bar">
                        <span style={{ width: `${t.progress}%`, background: STATUSES[t.status].c }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {quick === k && (
              <div className="quick">
                <input
                  autoFocus
                  value={text}
                  placeholder="Vazifa nomi… (Enter)"
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => !text && setQuick(null)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Escape') setQuick(null);
                    if (e.key === 'Enter' && text.trim()) {
                      const title = text.trim();
                      setText('');
                      await onQuickAdd(title, k);
                    }
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
