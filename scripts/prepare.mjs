/**
 * prepare.mjs — Post-install hook config (package.json "prepare").
 *
 * Sets `core.hooksPath` to `.githooks` so the local pre-commit hook
 * (docs quality gate) runs on every commit.
 *
 * Tolerant to CI/serverless build environments (Vercel, GitHub Actions)
 * that are NOT git worktrees: `git rev-parse` fails there, and we must
 * NOT fail `pnpm install` (exit 128 would block the deployment).
 */
import { spawnSync } from "node:child_process";

// 1. Are we inside a git worktree at all?
const probe = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "pipe" });
if (probe.status !== 0) {
  console.log("[prepare] Not a git worktree — skipping hooksPath config (CI/build).");
  process.exit(0);
}

// 2. Configure hooksPath (idempotent).
const set = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "pipe" });
if (set.status !== 0) {
  // Do not break install in odd environments (e.g. read-only .git/config).
  console.warn("[prepare] Could not set core.hooksPath — continuing (exit ignored).");
  process.exit(0);
}

console.log("[prepare] core.hooksPath → .githooks");
process.exit(0);
