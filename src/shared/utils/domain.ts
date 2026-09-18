/**
 * domain.ts — Pure helpers for domain normalization.
 *
 * Kept out of `'use server'` action modules: Next.js requires every export of
 * a Server Actions file to be an async function, so pure synchronous helpers
 * live here instead. Pure (no I/O) for unit testing in isolation.
 */

/** Normalizes a user-supplied domain: strips protocol, `www.` and any path. */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]!;
}
