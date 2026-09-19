'use client';

import { Menu as Base } from '@base-ui/react/menu';
import type { ComponentProps } from 'react';
import { cn, focusRing } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT DropdownMenu — Base UI Menu headless + glass.
   Navegación por teclado (flechas, Enter, Escape, type-ahead) nativa.
   Highlight de item vía `data-highlighted`. Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export const DropdownMenu = Base.Root;
export const DropdownMenuPortal = Base.Portal;

export function DropdownMenuTrigger({
  className,
  ...props
}: ComponentProps<typeof Base.Trigger>) {
  return (
    <Base.Trigger
      className={cn('cursor-pointer', focusRing, className)}
      {...props}
    />
  );
}

export function DropdownMenuPositioner({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof Base.Positioner>) {
  return (
    <Base.Positioner
      sideOffset={sideOffset}
      className={cn('z-[110] outline-none', className)}
      {...props}
    />
  );
}

export function DropdownMenuPopup({
  className,
  ...props
}: ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Popup
      className={cn(
        'glass-card min-w-48 rounded-xl p-1.5 shadow-2xl outline-none transition-all duration-150',
        'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
        'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof Base.Item>) {
  return (
    <Base.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-fg outline-none transition-colors',
        'data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Base.Separator>) {
  return (
    <Base.Separator
      className={cn('mx-2 my-1.5 h-px bg-border', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof Base.GroupLabel>) {
  return (
    <Base.GroupLabel
      className={cn(
        'px-3 py-1.5 text-2xs font-extrabold uppercase tracking-widest text-muted-fg',
        className,
      )}
      {...props}
    />
  );
}
