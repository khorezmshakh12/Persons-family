'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { setPasswordAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_WRAPPER =
  'flex items-center overflow-hidden rounded-xl border border-au-line bg-au-card shadow-sm transition-colors focus-within:border-au-accent focus-within:ring-2 focus-within:ring-au-accent';
const FIELD_INPUT =
  'h-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-au-ink shadow-none placeholder:text-au-faint focus-visible:ring-0';

export function SetPasswordForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    setPasswordAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-au-ink">
          {t('newPassword')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-au-muted">
            <Lock className="size-4" />
          </span>
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            className={FIELD_INPUT}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? tCommon('hidePassword') : tCommon('showPassword')}
            className="flex shrink-0 items-center px-3 text-au-muted hover:text-au-ink"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword" className="text-au-ink">
          {t('confirmPassword')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-au-muted">
            <Lock className="size-4" />
          </span>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            minLength={8}
            required
            className={FIELD_INPUT}
          />
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="h-11 w-full rounded-xl text-base">
        {isPending ? tCommon('loading') : t('setPassword')}
      </Button>
    </form>
  );
}
