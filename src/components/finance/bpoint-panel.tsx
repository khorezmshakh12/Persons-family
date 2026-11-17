'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Horizon } from '@/lib/bpoint';
import type { BpointGoalView } from '@/lib/bpoint-data';
import { BpointCard } from './bpoint-card';
import { BpointProgress } from './bpoint-progress';

/** B-nuqta: yarim yil / 1 yil / 3 yil tabs over the target card and the
 * "B-nuqta sari" chart. Used on /finance/[staffId] and the profile Finance
 * tab — the same block for every staff member. */
export function BpointPanel({ goals, canEdit, staffId }: { goals: BpointGoalView[]; canEdit: boolean; staffId: string }) {
  // Open on the 1-year goal if set, else the first one that is set.
  const initial = (goals.find((g) => g.horizon === '1y' && g.target > 0) ?? goals.find((g) => g.target > 0) ?? goals[0]).horizon;
  const [tab, setTab] = useState<Horizon>(initial);
  const goal = goals.find((g) => g.horizon === tab) ?? goals[0];

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="B-nuqta muddati" className="flex w-fit gap-1 rounded-au-ctl border border-au-line bg-au-card p-1">
        {goals.map((g) => (
          <button
            key={g.horizon}
            type="button"
            role="tab"
            aria-selected={tab === g.horizon}
            onClick={() => setTab(g.horizon)}
            className={cn(
              'rounded-au-ctl px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === g.horizon ? 'bg-au-primary text-au-primary-ink' : 'text-au-muted hover:bg-au-card-2 hover:text-au-ink',
            )}
          >
            {g.label}
            {g.target > 0 && <span className="ml-1 opacity-70">· {g.progress.pct}%</span>}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* key: each horizon has its own edit state */}
        <BpointCard key={goal.horizon} goal={goal} canEdit={canEdit} staffId={staffId} />
        <BpointProgress key={`c-${goal.horizon}`} goal={goal} />
      </div>
    </div>
  );
}
