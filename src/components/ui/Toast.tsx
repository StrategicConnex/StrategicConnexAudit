'use client';

import { Toast as Base } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Toast — Base UI Toast declarativo (Transition del spec §3.4).
   NOTA: el path imperativo actual (sonner + ToasterProvider) sigue vivo;
   la migración de call sites a este wrapper llega en Semana 10
   (NotificationCenter). Aquí queda el primitivo + provider + viewport.
   Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export const ToastProvider = Base.Provider;
export const useToastManager = Base.useToastManager;
export const createToastManager = Base.createToastManager;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof Base.Viewport>) {
  return (
    <Base.Viewport
      className={cn(
        'fixed right-6 bottom-6 z-[110] flex w-96 max-w-[calc(100vw-3rem)] flex-col gap-3 outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function ToastRoot({
  className,
  ...props
}: ComponentProps<typeof Base.Root>) {
  return (
    <Base.Root
      className={cn(
        'glass-card flex items-start gap-3 rounded-2xl p-4 shadow-2xl outline-none transition-all duration-300',
        'data-[starting-style]:translate-x-8 data-[starting-style]:opacity-0',
        'data-[ending-style]:translate-x-8 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

export function ToastTitle({
  className,
  ...props
}: ComponentProps<typeof Base.Title>) {
  return (
    <Base.Title
      className={cn('text-xs font-bold text-foreground', className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof Base.Description>) {
  return (
    <Base.Description
      className={cn('mt-0.5 text-xs leading-relaxed text-muted-fg', className)}
      {...props}
    />
  );
}

export function ToastClose({
  className,
  ...props
}: ComponentProps<typeof Base.Close>) {
  return (
    <Base.Close
      aria-label="Cerrar notificación"
      className={cn(
        'cursor-pointer text-muted-fg transition-colors hover:text-foreground',
        className,
      )}
      {...props}
    >
      <X size={14} strokeWidth={2.5} />
    </Base.Close>
  );
}

export function ToastAction({
  className,
  ...props
}: ComponentProps<typeof Base.Action>) {
  return (
    <Base.Action
      className={cn(
        'cursor-pointer rounded-full bg-corporate-primary px-3 py-1.5 text-2xs font-extrabold uppercase tracking-widest text-white transition-colors hover:bg-corporate-primary-light',
        className,
      )}
      {...props}
    />
  );
}
