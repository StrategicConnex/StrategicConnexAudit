import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts (last-wins for the same utility). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Keyboard-only focus ring — the SCAUDIT standard (WEB-UI-GUIDELINES §AP-001). */
export const focusRing = cn(
  "outline-none",
  "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
  "focus-visible:ring-offset-background",
);

/** Disabled state standard. */
export const disabled = "disabled:opacity-50 disabled:cursor-not-allowed";
