'use client';

import { TOGGLE_ALL_EVENT } from '@/components/ui/collapsible-card';

interface ExpandCollapseControlsProps {
  count: number;
  storageKeyPrefix: string;
  itemIds: string[];
}

export function ExpandCollapseControls({
  count,
  storageKeyPrefix,
  itemIds,
}: ExpandCollapseControlsProps) {
  if (count < 2) {
    return null;
  }

  const handleExpandAll = () => {
    for (const id of itemIds) {
      try {
        localStorage.setItem(`${storageKeyPrefix}-${id}`, 'true');
      } catch {
        // localStorage not available
      }
    }
    window.dispatchEvent(new CustomEvent(TOGGLE_ALL_EVENT, { detail: { prefix: storageKeyPrefix, open: true } }));
  };

  const handleCollapseAll = () => {
    for (const id of itemIds) {
      try {
        localStorage.setItem(`${storageKeyPrefix}-${id}`, 'false');
      } catch {
        // localStorage not available
      }
    }
    window.dispatchEvent(new CustomEvent(TOGGLE_ALL_EVENT, { detail: { prefix: storageKeyPrefix, open: false } }));
  };

  return (
    <div className="flex gap-2 text-xs">
      <button
        type="button"
        onClick={handleExpandAll}
        className="font-medium text-au-accent-text hover:text-au-accent-text/80 transition-colors"
      >
        Hammasini yoyish
      </button>
      <span className="text-au-muted">·</span>
      <button
        type="button"
        onClick={handleCollapseAll}
        className="font-medium text-au-accent-text hover:text-au-accent-text/80 transition-colors"
      >
        Hammasini yig&apos;ish
      </button>
    </div>
  );
}
