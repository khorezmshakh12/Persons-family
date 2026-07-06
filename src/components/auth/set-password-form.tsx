'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { setPasswordAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_WRAPPER =
  'flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm transition-colors focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20';
const FIELD_INPUT = 'h-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-slate-900 shadow-none focus-visible:ring-0';

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
        <Label htmlFor="password" className="text-slate-700">
          {t('newPassword')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-slate-400">
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
            className="flex shrink-0 items-center px-3 text-slate-400 hover:text-slate-600"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword" className="text-slate-700">
          {t('confirmPassword')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-slate-400">
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
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={isPending} className="h-11 w-full rounded-xl text-base">
        {isPending ? tCommon('loading') : t('setPassword')}
      </Button>
    </form>
  );
}
