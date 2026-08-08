import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusRing, disabled } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT Button — CVA primitive
   Variants map 1:1 to the DS tokens in globals.css (`@theme inline`) and
   the design patterns already present in the dashboard:
   primary (indigo), accent (chartreuse), destructive, outline, ghost,
   muted (the export-button pattern), and pill/rounded shapes.
   ═══════════════════════════════════════════════════════════════════════ */

export const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center whitespace-nowrap font-bold",
    "uppercase tracking-widest transition-[color,background-color,border-color,opacity,box-shadow,transform]",
    "cursor-pointer select-none",
    focusRing,
    disabled,
  ),
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-r from-primary to-primary/80 text-foreground border border-primary/20",
        accent:
          "bg-chartreuse/10 text-chartreuse border border-chartreuse/20 hover:bg-chartreuse/20",
        destructive:
          "bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20",
        outline:
          "bg-transparent text-foreground border border-border hover:bg-muted/10 hover:border-primary/30",
        ghost:
          "bg-transparent text-muted-fg border border-transparent hover:bg-muted/20 hover:text-foreground",
        muted:
          "bg-muted/30 text-foreground hover:bg-muted/60 hover:text-white border border-border/30 shadow-sm hover:shadow-md",
        inverted:
          "bg-foreground text-background hover:bg-foreground/90 border border-border shadow-md",
        cyan: "bg-cyan-500 text-black hover:bg-cyan-400 border border-transparent shadow-md",
        light:
          "bg-zinc-100 hover:bg-white text-black border border-transparent shadow-[0_4px_12px_rgba(255,255,255,0.1)]",
      },
      size: {
        xs: "h-7 px-2.5 text-[9px] rounded-md gap-1.5",
        sm: "h-8 px-3 text-[10px] rounded-lg gap-1.5",
        md: "h-10 px-4 text-[10px] rounded-lg gap-2",
        lg: "h-11 px-6 text-[11px] rounded-xl gap-2",
        icon: "size-8 rounded-lg",
      },
      shape: {
        squared: "",
        pill: "rounded-full",
      },
      press: {
        none: "",
        scale: "active:scale-[0.97]",
        subtle: "active:scale-[0.98]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      shape: "squared",
      press: "scale",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  shape,
  press,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, shape, press, className }))}
      {...props}
    />
  );
}
