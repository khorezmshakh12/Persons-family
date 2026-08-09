'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Mic, Square, Loader2, X } from 'lucide-react';
import { createIssueAction, requestIssueVoiceUploadUrlAction, type IssueActionState } from '@/lib/actions/issues';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type IssueAssignee = { id: string; first_name: string; last_name: string };

export function CreateIssueDialog({ assignees }: { assignees: IssueAssignee[] }) {
  const t = useTranslations('issues');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const [voicePath, setVoicePath] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [state, formAction, isPending] = useActionState<IssueActionState, FormData>(
    createIssueAction,
    undefined,
  );
  const nameFor = (id: string) => {
    const a = assignees.find((x) => x.id === id);
    return a ? `${a.first_name} ${a.last_name}` : t('unassigned');
  };

  useEffect(() => {
    if (state && !state.error) {
      setOpen(false);
      setVoicePath(null);
      setPreviewUrl(null);
    }
  }, [state]);

  function clearRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setVoicePath(null);
    setPreviewUrl(null);
  }

  /** Releases the microphone immediately without running the upload flow —
   * used when the dialog is closed or the component unmounts mid-recording.
   * Without this, closing the dialog (Escape, clicking outside, navigating
   * away) while recording leaves the mic active indefinitely with no
   * visible indication to the user. */
  function forceStopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsRecording(false);
  }

  useEffect(() => {
    return () => forceStopRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        clearRecording();
        setPreviewUrl(URL.createObjectURL(blob));

        setIsUploadingVoice(true);
        try {
          const uploadUrlResult = await requestIssueVoiceUploadUrlAction(`voice-note-${Date.now()}.webm`);
          if (uploadUrlResult.error || !uploadUrlResult.path || !uploadUrlResult.token) {
            toast.error(t('errors.voiceUploadFailed'));
            return;
          }
          const supabase = createClient();
          const { error: uploadError } = await supabase.storage
            .from('issue-voice-notes')
            .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, blob, { contentType: 'audio/webm' });
          if (uploadError) {
            toast.error(t('errors.voiceUploadFailed'));
            return;
          }
          setVoicePath(uploadUrlResult.path);
        } finally {
          setIsUploadingVoice(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.error(t('errors.micDenied'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          if (isRecording) forceStopRecording();
          clearRecording();
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('newIssue')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newIssue')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="voiceUrl" value={voicePath ?? ''} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">{t('titleLabel')}</Label>
            <Input id="title" name="title" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <button
                type="button"
                onClick={handleToggleRecording}
                disabled={isUploadingVoice}
                aria-label={isRecording ? t('stopRecording') : t('recordVoice')}
                className={cn(
                  'tap-scale flex size-8 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color,box-shadow,border-color] duration-200 ease-bounce hover:scale-110',
                  isRecording
                    ? 'animate-pulse border-red-400/60 bg-red-500/90 text-white shadow-[0_0_14px_4px_rgba(239,68,68,0.55)]'
                    : 'border-white/30 bg-white/10 text-white hover:bg-white/20',
                )}
              >
                {isRecording ? <Square className="size-3.5" /> : <Mic className="size-4" />}
              </button>
            </div>
            <Textarea id="description" name="description" maxLength={2000} rows={4} />
            {isRecording && (
              <div className="flex items-center gap-2 text-xs text-red-300">
                <span className="size-2 animate-pulse rounded-full bg-red-400" aria-hidden />
                {t('recording')}
              </div>
            )}
            {isUploadingVoice && (
              <div className="flex items-center gap-2 text-xs text-white/60">
                <Loader2 className="size-3.5 animate-spin" />
                {t('uploadingVoice')}
              </div>
            )}
            {previewUrl && !isRecording && (
              <div className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2">
                <Mic className="size-4 shrink-0 text-teal-300" />
                <audio controls preload="metadata" src={previewUrl} className="h-8 min-w-0 flex-1" />
                <button
                  type="button"
                  onClick={clearRecording}
                  aria-label={t('discardRecording')}
                  className="tap-scale shrink-0 text-white/60 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="assignedTo">{t('assignTo')}</Label>
            <Select name="assignedTo" defaultValue="none">
              <SelectTrigger id="assignedTo" className="w-full">
                <SelectValue>{(value: string) => (value === 'none' ? t('unassigned') : nameFor(value))}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('unassigned')}</SelectItem>
                {assignees.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.first_name} {a.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {state?.error && <p className="text-destructive text-sm">{t(`errors.${state.error}`)}</p>}
          <DialogFooter>
            <Button type="submit" loading={isPending} disabled={isUploadingVoice || isRecording}>
              {isPending ? tCommon('loading') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
