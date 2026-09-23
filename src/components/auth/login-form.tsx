'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, Lock, Eye, EyeOff } from 'lucide-react';
import { loginAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_WRAPPER =
  'flex items-center overflow-hidden rounded-xl border border-au-line bg-au-card shadow-sm transition-colors focus-within:border-au-accent focus-within:ring-2 focus-within:ring-au-accent';
const FIELD_INPUT =
  'h-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-au-ink shadow-none placeholder:text-au-faint focus-visible:ring-0';

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
        <Label htmlFor="phone" className="text-au-ink">
          {t('phone')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center gap-1.5 border-r border-au-line bg-au-card-2 px-3 py-2.5 text-sm font-medium text-au-muted">
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
        <Label htmlFor="password" className="text-au-ink">
          {t('password')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-au-muted">
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
            className="flex shrink-0 items-center px-3 text-au-muted hover:text-au-ink"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-700">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <Button type="submit" disabled={isPending} className="h-11 w-full rounded-xl text-base">
        {isPending ? tCommon('loading') : t('login')}
      </Button>
    </form>
  );
}
