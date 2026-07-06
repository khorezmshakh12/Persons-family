'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, Lock, Eye, EyeOff } from 'lucide-react';
import { loginAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_WRAPPER =
  'flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm transition-colors focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20';
const FIELD_INPUT = 'h-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-slate-900 shadow-none focus-visible:ring-0';

export function LoginForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone" className="text-slate-700">
          {t('phone')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-slate-500">
            <Phone className="size-4" />
            +998
          </span>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="90 123 45 67"
            autoComplete="tel"
            required
            className={FIELD_INPUT}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-slate-700">
          {t('password')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-slate-400">
            <Lock className="size-4" />
          </span>
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
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

      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={isPending} className="h-11 w-full rounded-xl text-base">
        {isPending ? tCommon('loading') : t('login')}
      </Button>
    </form>
  );
}
