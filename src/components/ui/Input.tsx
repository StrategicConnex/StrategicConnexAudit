import { useId, type InputHTMLAttributes } from "react";
import { cn, focusRing, disabled } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Input — form primitive with the DS focus ring and error state.
   ═══════════════════════════════════════════════════════════════════════ */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, type, error, id, ref, ...props }: InputProps) {
  const autoId = useId();
  const errorId = `${id ?? autoId}-error`;
  return (
    <div className="w-full">
      <input
        id={id}
        type={type}
        ref={ref}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-foreground",
          "placeholder:text-muted-fg/60",
          focusRing,
          "focus:border-primary/40",
          disabled,
          error && "border-destructive/50 focus:border-destructive/50 focus-visible:ring-destructive/40",
          className,
        )}
        {...props}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-xs font-semibold text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
