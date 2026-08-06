'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';

// A small static grid instead of pulling in a third-party emoji-picker
// dependency (extra bundle weight + supply-chain surface) for what's
// fundamentally a "pick one of ~60 common emoji" feature.
const EMOJIS = [
  '😀',
  '😂',
  '😍',
  '🥳',
  '😎',
  '🤔',
  '😢',
  '😡',
  '👍',
  '👎',
  '🙏',
  '👏',
  '💪',
  '🔥',
  '🎉',
  '❤️',
  '💯',
  '✅',
  '❌',
  '⚠️',
  '📌',
  '📎',
  '📷',
  '🎥',
  '🎤',
  '☕',
  '📚',
  '✏️',
  '🕒',
  '📅',
  '🏫',
  '🧑‍🏫',
  '👨‍👩‍👧‍👦',
  '🚀',
  '⭐',
  '🌟',
  '💡',
  '👋',
  '🤝',
  '🙌',
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
        // Explicit w-64 is load-bearing here: without it, this absolutely
        // positioned grid has no fixed width to shrink-to-fit against, and
        // Tailwind's grid-cols-N uses minmax(0, 1fr) tracks — with no floor,
        // an ambiguous shrink-to-fit width let every column collapse toward
        // 0 and the emoji glyphs overlapped instead of sitting in their own
        // cell.
        <div className="absolute bottom-full left-0 z-50 mb-2 grid w-64 grid-cols-6 gap-2 rounded-xl border border-white/20 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                setOpen(false);
              }}
              className="tap-scale flex cursor-pointer items-center justify-center rounded-lg p-2 text-xl transition-[background-color,transform] duration-200 ease-bounce hover:scale-110 hover:bg-white/10"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
