// @vitest-environment node
// tests/platform/distributed-cache-deletebyprefix.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { ROOT, splitStatements } from "../../scripts/db/rls-inventory.mjs";
import {
  createPostgresCacheStore,
  DEFAULT_TTL_MS,
  type SqlExec,
} from "@/shared/lib/distributed-cache";

const MIGRATION = readFileSync(
  join(ROOT, "drizzle/0040_platform_cache_queue.sql"),
  "utf8",
);

let pglite: PGlite;
let d: ReturnType<typeof drizzle>;
let store: ReturnType<typeof createPostgresCacheStore>;

beforeAll(async () => {
  pglite = new PGlite();
  d = drizzle(pglite);
  const exec: SqlExec = async (q) =>
    (await d.execute(q)) as unknown as { rows: unknown[]; rowCount?: number | null };

  for (const s of splitStatements(MIGRATION).filter((s: string) => s.trim().length > 0)) {
    await d.execute(sql.raw(s));
  }
  store = createPostgresCacheStore(exec);
});

describe("CacheStore.deleteByPrefix — postgres (C2)", () => {
  it("borra por prefijo y deja el resto intacto", async () => {
    await store.set("ai:seo-report:proj-a:hash-1", { c: "1" }, DEFAULT_TTL_MS);
    await store.set("ai:seo-report:proj-a:hash-2", { c: "2" }, DEFAULT_TTL_MS);
    await store.set("ai:seo-report:proj-b:hash-3", { c: "3" }, DEFAULT_TTL_MS);
    await store.set("otro:grupo:key", { c: "4" }, DEFAULT_TTL_MS);

    const deletedInA = await store.deleteByPrefix!("ai:seo-report:proj-a");
    expect(deletedInA).toBe(2);

    expect(await store.get("ai:seo-report:proj-a:hash-1")).toBeUndefined();
    expect(await store.get("ai:seo-report:proj-b:hash-3")).toEqual({ c: "3" });
    expect(await store.get("otro:grupo:key")).toEqual({ c: "4" });
  });

  it("prefijo sin matches devuelve 0 (idempotente)", async () => {
    expect(await store.deleteByPrefix!("ai:seo-report:proj-a")).toBe(0);
  });
});
