'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A small static grid instead of pulling in a third-party emoji-picker
// dependency (extra bundle weight + supply-chain surface) for what's
// fundamentally a "pick one of ~60 common emoji" feature.
const EMOJIS = [
  '😀', '😂', '😍', '🥳', '😎', '🤔', '😢', '😡', '👍', '👎',
  '🙏', '👏', '💪', '🔥', '🎉', '❤️', '💯', '✅', '❌', '⚠️',
  '📌', '📎', '📷', '🎥', '🎤', '☕', '📚', '✏️', '🕒', '📅',
  '🏫', '🧑‍🏫', '👨‍👩‍👧‍👦', '🚀', '⭐', '🌟', '💡', '👋', '🤝', '🙌',
];

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const t = useTranslations('chatHub');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('emoji')}
        className="text-white/70 hover:text-white"
      >
        <Smile className="size-5" />
      </Button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 grid grid-cols-8 gap-1 rounded-xl border border-white/20 bg-slate-900/95 p-2 shadow-xl backdrop-blur-xl">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="rounded-md p-1 text-lg hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
