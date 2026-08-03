'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Star, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { setDmConversationStatusAction } from '@/lib/actions/staff-chats';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type ConversationStatus = 'normal' | 'important';

type ConversationRow = {
  id: string;
  status: ConversationStatus;
  one: { first_name: string; last_name: string } | null;
  two: { first_name: string; last_name: string } | null;
};

/**
 * CEO/IT Developer only — a moderation view of who's DMing whom, not a
 * message reader (dm_conversations carries no message content, only
 * participants + status; staff_chats' own RLS keeps the actual DM text
 * private to its two participants regardless of this panel). Defaults to
 * "Important only" per the spec ("chats should NOT be visible on the
 * general chat list unless marked Important") — "Show all" exists so a
 * moderator has somewhere to discover a normal conversation worth flagging
 * in the first place.
 */
export function ImportantChatsPanel() {
  const t = useTranslations('chatHub');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [isPending, startTransition] = useTransition();

  async function load(all: boolean) {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('dm_conversations')
      .select(
        'id, status, one:profiles!dm_conversations_participant_one_fkey(first_name,last_name), two:profiles!dm_conversations_participant_two_fkey(first_name,last_name)',
      )
      .order('created_at', { ascending: false });
    if (!all) query = query.eq('status', 'important');
    const { data, error } = await query;
    if (!error) setConversations((data as unknown as ConversationRow[]) ?? []);
    setLoading(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) load(showAll);
  }

  function handleToggleAll() {
    const next = !showAll;
    setShowAll(next);
    load(next);
  }

  function handleSetStatus(conversationId: string, status: ConversationStatus) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('conversationId', conversationId);
      formData.set('status', status);
      const result = await setDmConversationStatusAction(undefined, formData);
      if (result?.error) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      setConversations((prev) =>
        showAll
          ? prev.map((c) => (c.id === conversationId ? { ...c, status } : c))
          : prev.filter((c) => c.id !== conversationId),
      );
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
          />
        }
      >
        <Star className="size-4" />
        {t('importantChats.title')}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('importantChats.title')}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-white/60">{t('importantChats.subtitle')}</p>
          <Button type="button" variant="ghost" size="sm" onClick={handleToggleAll}>
            {showAll ? t('importantChats.showImportantOnly') : t('importantChats.showAll')}
          </Button>
        </div>
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {loading ? (
            <Loader2 className="mx-auto size-5 animate-spin text-white/50" />
          ) : conversations.length === 0 ? (
            <p className="py-4 text-center text-sm text-white/50">{t('importantChats.empty')}</p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
              >
                <span className="text-sm">
                  {c.one ? `${c.one.first_name} ${c.one.last_name}` : '?'} ↔{' '}
                  {c.two ? `${c.two.first_name} ${c.two.last_name}` : '?'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  className={cn(
                    c.status === 'important'
                      ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
                      : 'border-white/20 bg-white/5 text-white/70',
                  )}
                  onClick={() =>
                    handleSetStatus(c.id, c.status === 'important' ? 'normal' : 'important')
                  }
                >
                  <Star className="size-3.5" />
                  {c.status === 'important' ? t('importantChats.unmark') : t('importantChats.mark')}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
