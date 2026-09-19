'use client';

import { Tabs as Base } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cn, focusRing } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Tabs — Base UI Tabs headless.
   tablist/tab/tabpanel con aria-selected y flechas de navegación nativas.
   Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export const Tabs = Base.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof Base.List>) {
  return (
    <Base.List
      className={cn('flex items-center gap-1 border-b border-border', className)}
      {...props}
    />
  );
}

export function TabsTab({
  className,
  ...props
}: ComponentProps<typeof Base.Tab>) {
  return (
    <Base.Tab
      className={cn(
        '-mb-px cursor-pointer border-b-2 border-transparent px-4 py-2.5 text-2xs font-extrabold uppercase tracking-widest text-muted-fg transition-colors',
        'data-[selected]:border-primary data-[selected]:text-foreground',
        'hover:text-foreground',
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

export function TabsPanel({
  className,
  ...props
}: ComponentProps<typeof Base.Panel>) {
  return (
    <Base.Panel
      className={cn('pt-4 outline-none', className)}
      {...props}
    />
  );
}
