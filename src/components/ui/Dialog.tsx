'use client';

import { Dialog as Base } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Dialog — Base UI headless + glass-card.
   Escape, focus-trap y scroll-lock nativos de Base UI (reemplazan el
   boilerplate manual de portales y listeners). Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export const Dialog = Base.Root;
export const DialogTrigger = Base.Trigger;
export const DialogPortal = Base.Portal;

export function DialogBackdrop({
  className,
  ...props
}: ComponentProps<typeof Base.Backdrop>) {
  return (
    <Base.Backdrop
      className={cn(
        'fixed inset-0 z-[100] bg-black/75 backdrop-blur-md transition-opacity duration-200',
        'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

export function DialogPopup({
  className,
  ...props
}: ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Popup
      className={cn(
        'glass-card fixed left-1/2 top-1/2 z-[101] w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        'rounded-2xl p-8 shadow-2xl outline-none transition-all duration-200',
        'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
        'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof Base.Title>) {
  return (
    <Base.Title
      className={cn(
        'text-xl font-bold tracking-tight text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Base.Description>) {
  return (
    <Base.Description
      className={cn('mt-1 text-xs font-semibold text-muted-fg', className)}
      {...props}
    />
  );
}

/** Botón X superior-derecho que cierra el diálogo. */
export function DialogCloseButton({
  className,
  ...props
}: ComponentProps<typeof Base.Close>) {
  return (
    <Base.Close
      aria-label="Cerrar diálogo"
      className={cn(
        'absolute top-5 right-5 cursor-pointer text-muted-fg transition-colors hover:text-foreground',
        className,
      )}
      {...props}
    >
      <X size={18} strokeWidth={2.5} />
    </Base.Close>
  );
}
