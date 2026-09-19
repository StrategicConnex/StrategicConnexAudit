'use client';

import { Switch as Base } from '@base-ui/react/switch';
import type { ComponentProps } from 'react';
import { cn, focusRing } from '@/lib/utils';

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Switch — Base UI Switch headless.
   role="switch" + aria-checked + Space/Enter nativos. Semana 2 rediseño.
   ═══════════════════════════════════════════════════════════════════════ */

export function Switch({
  className,
  size = 'md',
  ...props
}: ComponentProps<typeof Base.Root> & { size?: 'sm' | 'md' }) {
  return (
    <Base.Root
      className={cn(
        'relative shrink-0 cursor-pointer rounded-full border border-border bg-muted/60 transition-colors duration-200',
        'data-[checked]:border-primary/40 data-[checked]:bg-primary/80',
        focusRing,
        size === 'md' ? 'h-6 w-11' : 'h-5 w-9',
        className,
      )}
      {...props}
    >
      <Base.Thumb
        className={cn(
          'block rounded-full bg-white shadow transition-transform duration-200',
          size === 'md'
            ? 'size-5 data-[checked]:translate-x-5'
            : 'size-4 data-[checked]:translate-x-4',
        )}
      />
    </Base.Root>
  );
}
