'use client';

import { Select as Base } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn, focusRing } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Select — Base UI Select headless (Listbox del spec §3.4).
   Combobox con aria-expanded, listbox/options y type-ahead nativos.
   Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export const Select = Base.Root;

export function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Base.Trigger>) {
  return (
    <Base.Trigger
      className={cn(
        'flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-muted/60 px-4 py-3 text-xs font-semibold text-foreground shadow-sm transition-colors',
        'focus:border-primary/40 focus:outline-none',
        focusRing,
        className,
      )}
      {...props}
    >
      {children}
      <Base.Icon className="text-muted-fg transition-transform duration-150 data-[open]:rotate-180">
        <ChevronDown size={16} />
      </Base.Icon>
    </Base.Trigger>
  );
}

export const SelectValue = Base.Value;
export const SelectPortal = Base.Portal;

export function SelectPositioner({
  className,
  sideOffset = 6,
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

export function SelectPopup({
  className,
  ...props
}: ComponentProps<typeof Base.Popup>) {
  return (
    <Base.Popup
      className={cn(
        'glass-card max-h-64 overflow-y-auto rounded-xl p-1.5 shadow-2xl outline-none transition-all duration-150',
        'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
        'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
        className,
      )}
      {...props}
    />
  );
}

export const SelectList = Base.List;
export const SelectLabel = Base.Label;

export function SelectGroupLabel({
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

export function SelectItem({
  className,
  children,
  label,
  ...props
}: ComponentProps<typeof Base.Item>) {
  // label explícito (por defecto el texto hijo): registro determinista en
  // el store sin depender de la medición DOM del ItemText, y type-ahead
  // fiable incluso antes del primer montaje del popup.
  const textLabel =
    label ?? (typeof children === 'string' ? children : undefined);
  return (
    <Base.Item label={textLabel} className={cn(
        'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-fg outline-none transition-colors',
        'data-[highlighted]:bg-primary/10 data-[highlighted]:text-foreground',
        'data-[selected]:text-foreground',
        className,
      )}
      {...props}
    >
      <Base.ItemText>{children}</Base.ItemText>
      <Base.ItemIndicator className="text-primary">
        <Check size={14} strokeWidth={3} />
      </Base.ItemIndicator>
    </Base.Item>
  );
}
