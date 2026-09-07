'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Phone, Lock, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { loginAction, type AuthActionState } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fadeInUp, staggerContainer } from '@/lib/motion';

const FIELD_WRAPPER =
  'flex items-center overflow-hidden rounded-xl border border-white/20 bg-white/10 shadow-sm backdrop-blur-sm transition-all duration-200 focus-within:border-teal-400/60 focus-within:ring-2 focus-within:ring-teal-400/30 focus-within:shadow-[0_0_12px_rgba(45,212,191,0.2)]';
const FIELD_INPUT =
  'h-auto rounded-none border-0 bg-transparent px-3 py-2.5 text-white shadow-none placeholder:text-white/35 focus-visible:ring-0';

export function LoginForm() {
  const t = useTranslations('auth');
  const tCommon = useTranslations('common');
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    loginAction,
    undefined,
  );

  return (
    <motion.form
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      action={formAction}
      className="flex flex-col gap-5"
    >
      <motion.div variants={fadeInUp} className="flex flex-col gap-1.5">
        <Label htmlFor="phone" className="text-white/80">
          {t('phone')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center gap-1.5 border-r border-white/15 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/60">
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
      </motion.div>

      <motion.div variants={fadeInUp} className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-white/80">
          {t('password')}
        </Label>
        <div className={FIELD_WRAPPER}>
          <span className="flex shrink-0 items-center pl-3 text-white/40">
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
            className="flex shrink-0 items-center px-3 text-white/40 hover:text-white/80"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </motion.div>

      {state?.error && (
        <motion.p
          key={state.error}
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: [0, -4, 4, -4, 4, 0] }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-sm text-red-200"
        >
          {t(`errors.${state.error}`)}
        </motion.p>
      )}

      <motion.div variants={fadeInUp}>
        <Button type="submit" disabled={isPending} className="h-11 w-full rounded-xl text-base">
          {isPending ? tCommon('loading') : t('login')}
        </Button>
      </motion.div>
    </motion.form>
  );
}
