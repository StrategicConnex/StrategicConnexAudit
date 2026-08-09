'use client';

import { useState, Suspense, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/shared/lib/supabase/client';
import { useSearchParams } from 'next/navigation';

import { Mail, Loader2, CheckCircle2, AlertCircle, ArrowRight, Shield, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/app/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/shared/design-system';
import AiCoreVisual from '../components/AiCoreVisual';
import { NeuralNetworkBackground } from '@/components/NeuralNetworkBackground';

// ─── Placeholder rotativo ──────────────────────────────────────────
const PLACEHOLDER_TEXTS = [
  'tu@empresa.com',
  'juan@correo.com',
  'analista@dominio.com',
  'tu@outlook.com',
];

function AnimatedPlaceholder() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let innerTimer: ReturnType<typeof setTimeout>;
    const interval = setInterval(() => {
      setVisible(false);
      innerTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % PLACEHOLDER_TEXTS.length);
        setVisible(true);
      }, 300);
    }, 3500);
    return () => {
      clearInterval(interval);
      clearTimeout(innerTimer);
    };
  }, []);

  return (
    <span
      className={`inline-block transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
    >
      {PLACEHOLDER_TEXTS[index]}
    </span>
  );
}

function LoginContent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success' | 'warning', text: string } | null>(null);
  const [validationState, setValidationState] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  const [validationReason, setValidationReason] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';
  const supabase = createClient();
  const t = useTranslations('login');

  // ─── Entrance stagger ───────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 80);
    return () => clearTimeout(t);
  }, []);

  // ─── Validación de email en tiempo real ─────────────────────────
  const validateEmail = useCallback(async (value: string) => {
    if (!value || !value.includes('@')) {
      setValidationState('idle');
      setValidationReason(null);
      return;
    }

    setValidationState('validating');

    try {
      const res = await fetch('/api/auth/validate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value.trim() }),
      });

      const data = await res.json();

      if (res.status === 429) {
        // Rate limited — mostrar advertencia pero permitir reintentar
        setValidationState('invalid');
        setValidationReason(data.retryAfter                        ? t('rateLimitedWithRetry', { retryAfter: data.retryAfter })
                        : t('rateLimited')
        );
        return;
      }

      if (data.valid) {
        setValidationState('valid');
        setValidationReason(null);
      } else {
        setValidationState('invalid');
        setValidationReason(data.reason || t('emailInvalid'));
      }
    } catch {
      // Fallback: si la API falla, validación básica local
      const basicValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
      setValidationState(basicValid ? 'valid' : 'invalid');
      setValidationReason(basicValid ? null : t('networkError'));
    }
  }, [t]);

  // ─── Referencia para el timer de debounce ──────────────────────
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setMessage(null);

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => validateEmail(value), 400);
  };

  // ─── Envío del Magic Link ──────────────────────────────────────
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setMessage({ type: 'error', text: t('emailRequired') });
      return;
    }

    if (validationState === 'invalid') {
      setMessage({ type: 'error', text: validationReason || t('emailInvalidGeneric') });
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setEmailSent(true);
      setMessage({
        type: 'success',
        text: t('emailSentSuccess'),
      });
    }
    setLoading(false);
  };

  // ═════════════════════════════════════════════════════════════════
  // Pantalla: Email Enviado
  // ═════════════════════════════════════════════════════════════════
  if (emailSent) {
    return (
      <div className="min-h-dvh w-full flex items-center justify-center bg-background relative overflow-hidden">
        {/* Red neuronal de fondo — z-0, pointer-events none, sin reducir legibilidad */}
        <NeuralNetworkBackground />

        {/* Background orbs */}
        <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-indigo-600/10 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '8s', animationDelay: '0s' }} />
        <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-chartreuse/8 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '10s', animationDelay: '-3s' }} />

        <div className="z-10 w-full max-w-md px-4 sm:px-6 md:px-8">
          <div className="glass-card p-6 sm:p-8">
            {/* Top glow line */}
            <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

            <div className="animate-fade-in">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-chartreuse/10 border border-chartreuse/20 flex items-center justify-center mx-auto mb-5 sm:mb-6">
                <CheckCircle2 className="w-7 h-7 sm:w-8 sm:h-8 text-chartreuse" style={{ animation: 'scale-check 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
              </div>

              <h2 className="font-display text-xl sm:text-2xl font-extrabold text-foreground tracking-tight mb-3 text-center">
                {t('emailSentTitle')}
              </h2>

              <p className="text-sm sm:text-base text-muted-fg mb-2 leading-relaxed text-center">
                {t('emailSentDescription', { email })}
              </p>

              <p className="text-xs sm:text-sm text-muted-fg/70 mb-6 sm:mb-8 leading-relaxed text-center">
                {t('emailSentSpamNote')}
              </p>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 mb-6 sm:mb-8 text-left">
                <p className="text-xs sm:text-sm text-amber-400/80 leading-relaxed flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {t('emailSentWarning')}
                </p>
              </div>

              <button
                onClick={() => {
                  setEmailSent(false);
                  setMessage(null);
                }}
                className="block mx-auto text-sm text-muted-fg hover:text-foreground transition-colors"
              >
                {t('useAnotherEmail')}
              </button>
            </div>
          </div>

          <p className="mt-6 text-center text-[10px] sm:text-xs text-muted-fg/40">
            {t('footerProtected')} & StrategicAudit Pro Infrastructure
          </p>
        </div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════
  // Pantalla: Login
  // ═════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background relative overflow-hidden">
      {/* ── Red neuronal de fondo — z-0, pointer-events none, sin reducir legibilidad ── */}
      <NeuralNetworkBackground listening={emailFocused} />

      {/* ── Background orbs animadas ── */}
      <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-indigo-600/12 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '8s', animationDelay: '0s' }} />
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-chartreuse/8 blur-[150px] rounded-full animate-pulse" style={{ animationDuration: '10s', animationDelay: '-3s' }} />
      <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] bg-indigo-600/6 blur-[120px] rounded-full animate-pulse hidden sm:block" style={{ animationDuration: '12s', animationDelay: '-1.5s' }} />

      {/* ── Scan-line overlay ── */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.03) 1px, rgba(255,255,255,0.03) 2px)',
          backgroundSize: '100% 2px',
        }}
      />

      <div
        className={`z-10 w-full max-w-sm sm:max-w-md px-4 sm:px-6 md:px-8 transition-all duration-700 ${
          showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <div className="glass-card p-6 sm:p-8 relative">
          {/* Top glow line */}
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

          {/* ── Header ── */}
          <div className="text-center mb-7 sm:mb-8">
            <div className="inline-flex mb-4 justify-center items-center">
              <AiCoreVisual size={80} interactive={true} />
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {t('title')}
            </h1>
            <p className="text-sm sm:text-base text-muted-fg mt-2">
              {t('subtitle')}
            </p>
          </div>

          {/* ── Formulario ── */}
          <form onSubmit={handleMagicLink} className="space-y-4 sm:space-y-5">
            <div className="space-y-1.5 sm:space-y-2">
              <label
                htmlFor="login-email"
                className="text-xs sm:text-sm font-medium text-card-fg/80 ml-1 transition-colors"
              >
                {t('emailLabel')}
              </label>

              <div className="relative group">
                {/* Mail icon — cambia de color según estado */}
                <div className="absolute inset-y-0 left-0 pl-3 sm:pl-3.5 flex items-center pointer-events-none">
                  <Mail className={`h-4 w-4 sm:h-5 sm:w-5 transition-all duration-300 ${
                    validationState === 'valid'
                      ? 'text-chartreuse scale-110'
                      : validationState === 'invalid'
                      ? 'text-destructive'
                      : validationState === 'validating'
                      ? 'text-chartreuse/60'
                      : 'text-muted-fg group-focus-within:text-primary'
                  }`} />
                </div>

                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                  placeholder=" "
                  autoFocus
                  autoComplete="email"
                  aria-describedby={validationReason ? 'email-validation-msg' : undefined}
                  className={`block w-full pl-9 sm:pl-10 pr-9 sm:pr-10 py-2.5 sm:py-3 bg-input/50 border rounded-xl text-sm sm:text-base text-foreground placeholder-transparent focus:outline-none focus:ring-2 transition-all duration-300 ${
                    validationState === 'valid'
                      ? 'border-chartreuse/50 focus:ring-chartreuse/30 focus:border-chartreuse shadow-[0_0_20px_-8px_oklch(0.78_0.18_140/0.15)]'
                      : validationState === 'invalid'
                      ? 'border-destructive/50 focus:ring-destructive/30 focus:border-destructive shadow-[0_0_20px_-8px_oklch(0.55_0.22_25/0.15)]'
                      : validationState === 'validating'
                      ? 'border-chartreuse/30 focus:ring-chartreuse/20 focus:border-chartreuse/40'
                      : 'border-border focus:ring-primary/30 focus:border-primary/50'
                  }`}
                />

                {/* Floating label (placeholder animado como label flotante) */}
                <div
                  className={`absolute left-9 sm:left-10 top-1/2 -translate-y-1/2 text-sm sm:text-base text-muted-fg pointer-events-none transition-all duration-300 origin-left ${
                    email
                      ? 'opacity-0 translate-y-[-1.2rem] scale-75'
                      : 'opacity-100'
                  }`}
                >
                  <AnimatedPlaceholder />
                </div>

                {/* Validation icon animado */}
                <div className="absolute inset-y-0 right-0 pr-3 sm:pr-3.5 flex items-center pointer-events-none">
                  {validationState === 'validating' && (
                    <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chartreuse animate-spin" />
                  )}
                  {validationState === 'valid' && (
                    <CheckCircle2
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-chartreuse"
                      style={{ animation: 'scale-check 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    />
                  )}
                  {validationState === 'invalid' && (
                    <AlertCircle
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive"
                      style={{ animation: 'scale-check 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                    />
                  )}
                </div>
              </div>

              {/* Validation message animado */}
              <div
                id="email-validation-msg"
                role="status"
                aria-live="polite"
                className="overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: validationState === 'invalid' || validationState === 'valid' ? '4rem' : '0',
                  opacity: validationState === 'invalid' || validationState === 'valid' ? 1 : 0,
                }}
              >
                {validationState === 'invalid' && validationReason && (
                  <p className="text-[11px] sm:text-xs text-destructive mt-1.5 ml-1 flex items-center gap-1.5"
                     style={{ animation: 'message-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {validationReason}
                  </p>
                )}
                {validationState === 'valid' && (
                  <p className="text-[11px] sm:text-xs text-chartreuse/80 mt-1.5 ml-1 flex items-center gap-1"
                     style={{ animation: 'message-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    {t('emailValid')}
                  </p>
                )}
              </div>
            </div>

            {/* Message banner animado */}
            <div
              className="overflow-hidden transition-all duration-400 ease-out"
              style={{
                maxHeight: message ? '6rem' : '0',
                opacity: message ? 1 : 0,
                transform: message ? 'scaleY(1)' : 'scaleY(0.97)',
              }}
            >
              {message && (
                <div className={`p-3 sm:p-3.5 rounded-xl text-xs sm:text-sm flex items-start gap-2.5 origin-top ${
                  message.type === 'error'
                    ? 'bg-destructive/10 text-destructive border border-destructive/15'
                    : message.type === 'warning'
                    ? 'bg-chart-warning/10 text-chart-warning border border-chart-warning/15'
                    : 'bg-chartreuse/10 text-chartreuse border border-chartreuse/15'
                }`}>
                  <div className={`shrink-0 transition-transform duration-300 ${
                    message ? 'scale-100' : 'scale-0'
                  }`}>
                    {message.type === 'error' || message.type === 'warning'
                      ? <AlertCircle className="w-4 h-4 mt-0.5" />
                      : <CheckCircle2 className="w-4 h-4 mt-0.5" />
                    }
                  </div>
                  <span>{message.text}</span>
                </div>
              )}
            </div>

            {/* Botón principal con micro-interacciones */}
            <button
              type="submit"
              disabled={loading || validationState === 'invalid' || !email.trim()}
              className={`group relative w-full flex items-center justify-center gap-2 py-3 sm:py-3.5 px-4 rounded-xl font-semibold focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background transition-all duration-300 active:scale-[0.97] overflow-hidden ${
                loading || validationState === 'invalid' || !email.trim()
                  ? 'cursor-not-allowed bg-muted text-muted-foreground'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 hover:shadow-primary/30'
              }`}
            >
              {/* Shimmer overlay solo en hover (cuando está habilitado) */}
              {(validationState === 'valid' || validationState === 'idle' || validationState === 'validating') && !loading && (
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              )}

              <span className="relative z-10 flex items-center gap-2">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                    <span className="text-sm sm:text-base">{t('sendingButton')}</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-sm sm:text-base">{t('sendButton')}</span>
                    <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </button>              <p className="text-[10px] sm:text-xs text-muted-fg/70 text-center leading-relaxed">
              {t('footerText')}
              {validationState === 'invalid' && validationReason?.toLowerCase().includes('desechable') && (
                <span className="block mt-1.5 text-amber-400/60 text-[10px] sm:text-xs">
                  {t('disposableEmail')}
                </span>
              )}
            </p>
          </form>

          {/* Footer */}
          <div className="mt-7 sm:mt-8 pt-5 sm:pt-6 border-t border-border">
            <div className="flex items-center justify-center gap-2 text-[10px] sm:text-xs text-muted-fg/60">
              <Shield className="w-3 h-3" />
              <span>{t('footerProtected')}</span>
              <span className="text-border mx-1">·</span>
              <Sparkles className="w-3 h-3" />
              <span>{t('footerEnterprise')}</span>
            </div>
          </div>
        </div>          <div className="mt-3 flex items-center justify-center gap-2">
            <ThemeSwitcher />
            <LanguageSwitcher mini />
          </div>
          <p className="mt-2 text-center text-[10px] sm:text-xs text-muted-fg/40">
          {t('footerBrand')}
        </p>
      </div>
    </div>
  );
}

function LoginSkeleton() {
  return (
    <div className="min-h-dvh bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
}
