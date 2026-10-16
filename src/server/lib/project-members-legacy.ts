/**
 * project-members-legacy.ts
 *
 * Repo-level marker: `project_members` was removed from the product and from
 * the Drizzle schema in migration 0052 (project is owner-only, ADR-0XX).
 * This file exists ONLY so that legacy/reserved code paths that still import
 * `projectMembers` keep compiling during the transition. It is NOT part of the
 * active product and must not acquire any real usage.
 *
 * If you are touching product code and reach for this import, stop: the
 * correct path is ownership-only authorization in `project-access.ts`.
 */

// Deliberately NOT importing any real table definition. This is a compile-time
// seam for legacy code paths that have not been removed yet; any new caller
// should be treated as a regression in intent, not just a missing import.
export const projectMembers = undefined as unknown;
