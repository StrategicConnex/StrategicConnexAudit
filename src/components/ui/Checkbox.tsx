'use client';

import { cn } from '@/lib/utils';
import type { InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  checked?: boolean;
}

export function Checkbox({ className, checked, ...props }: CheckboxProps) {
  return (
    <label className={cn('inline-flex items-center gap-2 cursor-pointer', className)}>
      <input
        type="checkbox"
        checked={checked}
        className={cn(
          'h-4 w-4 rounded border-border bg-muted text-primary focus:ring-primary focus:ring-offset-background',
          'data-[checked=true]:border-primary data-[checked=true]:bg-primary data-[checked=true]:text-primary-foreground',
        )}
        {...props}
      />
    </label>
  );
}
