import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Card — compound primitive over the `glass-card` @utility
   (globals.css). Matches the DS: deep indigo-charcoal glass surfaces.
   ═══════════════════════════════════════════════════════════════════════ */

export function Card({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className={cn("glass-card rounded-2xl relative", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex flex-col gap-1 p-5 pb-0", className)} {...props} />;
}

export function CardTitle({ className, ref, ...props }: HTMLAttributes<HTMLHeadingElement> & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h3
      ref={ref}
      className={cn("text-sm font-extrabold uppercase tracking-widest text-foreground", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ref, ...props }: HTMLAttributes<HTMLParagraphElement> & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <p
      ref={ref}
      className={cn("text-xs text-muted-fg leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ref, ...props }: HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }) {
  return <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />;
}
