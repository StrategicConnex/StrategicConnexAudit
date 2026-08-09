import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IntelligenceCache, executionCache, dnsCache, geoipCache } from "./cache";

describe("IntelligenceCache — caché TTL-aware en memoria", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buildKey normaliza target a lowercase trim", () => {
    expect(IntelligenceCache.buildKey("dns.lookup", "Example.COM ")).toBe("dns.lookup::example.com");
  });

  it("get devuelve undefined en miss y cuenta miss", () => {
    const c = new IntelligenceCache();
    expect(c.get("missing")).toBeUndefined();
    expect(c.stats.misses).toBe(1);
    expect(c.stats.hitRatio).toBe(0);
  });

  it("set + get round-trip con hit", () => {
    const c = new IntelligenceCache<string>();
    c.set("k", "v");
    expect(c.get("k")).toBe("v");
    expect(c.stats.hits).toBe(1);
    expect(c.stats.hitRatio).toBe(1);
  });

  it("expira entradas tras el TTL (lazy eviction)", () => {
    const c = new IntelligenceCache<string>({ ttlMs: 1000 });
    c.set("k", "v");
    vi.advanceTimersByTime(1001);
    expect(c.get("k")).toBeUndefined();
    expect(c.stats.misses).toBe(1);
  });

  it("respeta un ttlMs por entrada", () => {
    const c = new IntelligenceCache<string>({ ttlMs: 60000 });
    c.set("short", "v", 100);
    c.set("long", "v");
    vi.advanceTimersByTime(200);
    expect(c.get("short")).toBeUndefined();
    expect(c.get("long")).toBe("v");
  });

  it("getOrCompute computa en miss y devuelve cacheado en hit", async () => {
    const c = new IntelligenceCache<string>();
    const compute = vi.fn(async () => "computado");
    const r1 = await c.getOrCompute("k", compute);
    expect(r1).toEqual({ value: "computado", fromCache: false });
    const r2 = await c.getOrCompute("k", compute);
    expect(r2).toEqual({ value: "computado", fromCache: true });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("getOrCompute con valor undefined trata como miss (recomputa)", async () => {
    const c = new IntelligenceCache<string | undefined>();
    const compute = vi.fn(async () => undefined);
    const r1 = await c.getOrCompute("k", compute);
    expect(r1.fromCache).toBe(false);
    const r2 = await c.getOrCompute("k", compute);
    expect(r2.fromCache).toBe(false);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("hace eviction LRU/FIFO al superar maxSize", () => {
    const c = new IntelligenceCache<string>({ maxSize: 2 });
    c.set("a", "1");
    c.set("b", "2");
    c.set("c", "3"); // expulsa "a" (la más antigua)
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("2");
    expect(c.get("c")).toBe("3");
    expect(c.stats.evictions).toBe(1);
  });

  it("re-set de una clave existente NO expulsa", () => {
    const c = new IntelligenceCache<string>({ maxSize: 2 });
    c.set("a", "1");
    c.set("a", "1b");
    c.set("b", "2");
    c.set("c", "3"); // expulsa "a"
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe("2");
  });

  it("invalidateTarget borra solo las claves del target", () => {
    const c = new IntelligenceCache<string>();
    c.set("dns.lookup::example.com", "a");
    c.set("tls.scan::example.com", "b");
    c.set("dns.lookup::other.org", "c");
    expect(c.invalidateTarget("EXAMPLE.com")).toBe(2);
    expect(c.get("dns.lookup::example.com")).toBeUndefined();
    expect(c.get("dns.lookup::other.org")).toBe("c");
  });

  it("purgeExpired limpia las expiradas y clear vacía todo", () => {
    const c = new IntelligenceCache<string>({ ttlMs: 1000 });
    c.set("exp", "1");
    c.set("ok", "2", 60000);
    vi.advanceTimersByTime(2000);
    expect(c.purgeExpired()).toBe(1);
    expect(c.stats.size).toBe(1);
    c.clear();
    expect(c.stats.size).toBe(0);
  });

  it("delete manual devuelve true/false", () => {
    const c = new IntelligenceCache<string>();
    c.set("k", "v");
    expect(c.delete("k")).toBe(true);
    expect(c.delete("k")).toBe(false);
  });

  it("hitRatio parcial con hit y miss mezclados", () => {
    const c = new IntelligenceCache<string>();
    c.set("k", "v");
    c.get("k"); // hit
    c.get("missing"); // miss
    expect(c.stats.hitRatio).toBe(0.5);
  });

  it("invalidateTarget sin coincidencias devuelve 0", () => {
    const c = new IntelligenceCache<string>();
    c.set("dns.lookup::example.com", "a");
    expect(c.invalidateTarget("otro.org")).toBe(0);
    expect(c.stats.size).toBe(1);
  });

  it("purgeExpired sin entradas expiradas devuelve 0", () => {
    const c = new IntelligenceCache<string>({ ttlMs: 60000 });
    c.set("k", "v");
    expect(c.purgeExpired()).toBe(0);
  });

  it("getOrCompute con TTL: el valor expira y se recomputa", async () => {
    const c = new IntelligenceCache<string>({ ttlMs: 60000 });
    const compute = vi.fn(async () => "v");
    await c.getOrCompute("k", compute, 100);
    vi.advanceTimersByTime(200);
    const r = await c.getOrCompute("k", compute);
    expect(r.fromCache).toBe(false);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("set con ttlMs por entrada más corto que el default", () => {
    const c = new IntelligenceCache<string>({ ttlMs: 60000 });
    c.set("k", "v", 50);
    vi.advanceTimersByTime(60);
    expect(c.get("k")).toBeUndefined();
  });

  it("las instancias globales existen con configuraciones distintas", () => {
    expect(executionCache).toBeInstanceOf(IntelligenceCache);
    expect(dnsCache).toBeInstanceOf(IntelligenceCache);
    expect(geoipCache).toBeInstanceOf(IntelligenceCache);
  });
});
