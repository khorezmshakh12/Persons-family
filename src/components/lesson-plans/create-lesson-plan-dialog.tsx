'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { requestLessonPlanUploadUrlAction, saveLessonPlanAction } from '@/lib/actions/lesson-plans';
import {
  LESSON_PLAN_ALLOWED_TYPES,
  LESSON_PLAN_MAX_FILE_BYTES,
} from '@/lib/lesson-plan-constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

export function CreateLessonPlanDialog() {
  const t = useTranslations('lessonPlans');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const topic = String(formData.get('topic') ?? '');
      const planDate = String(formData.get('planDate') ?? '');
      const file = formData.get('file');

      let filePath = '';
      let fileName = '';
      let fileType = '';

      if (file instanceof File && file.size > 0) {
        if (file.size > LESSON_PLAN_MAX_FILE_BYTES) {
          setError('fileTooLarge');
          return;
        }
        if (!LESSON_PLAN_ALLOWED_TYPES[file.type]) {
          setError('invalidFileType');
          return;
        }

        // Uploads go straight from the browser to Supabase Storage using a
        // signed URL, never through this Next.js server — that's what lets
        // files exceed Vercel's 4.5MB serverless function payload limit.
        const uploadUrlResult = await requestLessonPlanUploadUrlAction(file.name, file.type);
        if (uploadUrlResult.error || !uploadUrlResult.path || !uploadUrlResult.token) {
          setError(uploadUrlResult.error ?? 'uploadFailed');
          return;
        }

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from('lesson-files')
          .uploadToSignedUrl(uploadUrlResult.path, uploadUrlResult.token, file, {
            contentType: file.type,
          });
        if (uploadError) {
          setError('uploadFailed');
          return;
        }

        filePath = uploadUrlResult.path;
        fileName = file.name;
        fileType = LESSON_PLAN_ALLOWED_TYPES[file.type];
      }

      const saveData = new FormData();
      saveData.set('topic', topic);
      saveData.set('planDate', planDate);
      saveData.set('filePath', filePath);
      saveData.set('fileName', fileName);
      saveData.set('fileType', fileType);

      const result = await saveLessonPlanAction(undefined, saveData);
      if (result?.error) {
        setError(result.error);
        return;
      }

      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {t('addPlan')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addPlan')}</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic">{t('topic')}</Label>
            <Input id="topic" name="topic" required maxLength={200} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="planDate">{t('date')}</Label>
            <Input id="planDate" name="planDate" type="date" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="file">{t('file')}</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".pdf,.docx,image/jpeg,image/png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            />
            <p className="text-muted-foreground text-xs">{t('fileHint')}</p>
          </div>
          {error && <p className="text-destructive text-sm">{t(`errors.${error}`)}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? tCommon('loading') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
