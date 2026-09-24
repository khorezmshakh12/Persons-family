'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUSES, WORKSTREAMS, type StrategyTask, type TaskStatus } from '@/lib/strategy';
import { DueTag, PersonAvatar, PriorityChip, WsTag } from './bits';
import type { WorkspaceApi } from './strategy-workspace';

type SortKey = 't' | 'ws' | 'who' | 'e' | 'pr' | 'p';
const PR_ORDER = { high: 0, med: 1, low: 2 };

export function ListView({ api, tasks }: { api: WorkspaceApi; tasks: StrategyTask[] }) {
  const [sort, setSort] = useState<{ k: SortKey; d: 1 | -1 }>({ k: 'e', d: 1 });
  const [collapsed, setCollapsed] = useState<Partial<Record<TaskStatus, boolean>>>({});
  const name = (t: StrategyTask) => {
    const p = t.assignee_id ? api.personById.get(t.assignee_id) : undefined;
    return p ? `${p.first_name} ${p.last_name}` : '';
  };
  const key: Record<SortKey, (t: StrategyTask) => string | number> = {
    t: (t) => t.title,
    ws: (t) => WORKSTREAMS[t.workstream].n,
    who: name,
    e: (t) => t.end_date,
    pr: (t) => PR_ORDER[t.priority],
    p: (t) => t.progress,
  };
  const sorted = [...tasks].sort((a, b) => {
    const x = key[sort.k](a);
    const y = key[sort.k](b);
    return (x > y ? 1 : x < y ? -1 : 0) * sort.d;
  });
  const th = (k: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ k, d: s.k === k ? ((-s.d) as 1 | -1) : 1 }))}>
      {label}
      {sort.k === k ? (sort.d > 0 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div className="sx-card sx-list sx-rise">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              {th('t', 'Vazifa')}
              {th('ws', "Yo'nalish")}
              {th('who', "Mas'ul")}
              {th('e', 'Muddat')}
              {th('pr', 'Ustuvorlik')}
              <th>Holat</th>
              {th('p', 'Progress')}
            </tr>
          </thead>
          {(Object.keys(STATUSES) as TaskStatus[]).map((k) => {
            const L = sorted.filter((t) => t.status === k);
            return (
              <tbody key={k}>
                <tr className="grp" onClick={() => setCollapsed((c) => ({ ...c, [k]: !c[k] }))}>
                  <td colSpan={8}>
                    <span className="dot" style={{ background: STATUSES[k].c }} />
                    {STATUSES[k].n}
                    <small>{L.length}</small>
                    <span className="float-right text-au-faint">{collapsed[k] ? '▸' : '▾'}</span>
                  </td>
                </tr>
                {!collapsed[k] &&
                  L.map((t, i) => {
                    const who = t.assignee_id ? api.personById.get(t.assignee_id) : undefined;
                    return (
                      <tr key={t.id} className="task" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                        <td>
                          <button
                            className={cn('chk', t.status === 'done' && 'on')}
                            aria-label="Bajarildi"
                            onClick={() => api.moveTask(t.id, t.status === 'done' ? 'progress' : 'done')}
                          >
                            <Check className="size-3" strokeWidth={3.5} />
                          </button>
                        </td>
                        <td>
                          <button className="tt" onClick={() => api.openTask(t.id)}>
                            {t.title}
                          </button>
                        </td>
                        <td>
                          <WsTag ws={t.workstream} />
                        </td>
                        <td>
                          <span className="inline-flex items-center gap-2">
                            <PersonAvatar person={who} size={24} />
                            {who?.first_name ?? <span className="text-au-faint">—</span>}
                          </span>
                        </td>
                        <td>
                          <DueTag task={t} today={api.today} />
                        </td>
                        <td>
                          <PriorityChip priority={t.priority} />
                        </td>
                        <td>
                          <select
                            className={`st-${t.status}`}
                            value={t.status}
                            onChange={(e) => api.moveTask(t.id, e.target.value as TaskStatus)}
                          >
                            {(Object.keys(STATUSES) as TaskStatus[]).map((x) => (
                              <option key={x} value={x}>
                                {STATUSES[x].n}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <div className="pwrap">
                            <div className="bar">
                              <span style={{ width: `${t.progress}%`, background: STATUSES[t.status].c }} />
                            </div>
                            <span className="tabular-nums">{t.progress}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            );
          })}
        </table>
      </div>
      {tasks.length === 0 && <div className="empty">Filtrga mos vazifa topilmadi</div>}
    </div>
  );
}
