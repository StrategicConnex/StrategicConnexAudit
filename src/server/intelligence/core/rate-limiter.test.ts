import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlidingWindowRateLimiter } from "./rate-limiter";

describe("SlidingWindowRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests within the limit", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    limiter.check("a");
    limiter.check("a");
    const result = limiter.check("a");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks different keys independently", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
  });

  it("resets after window expires", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 1,
      windowMs: 10_000,
      blockOnExcessMs: 5_000,
      purgeInterval: 1000, // disable auto-purge
    });
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    vi.advanceTimersByTime(10_001);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("blocks temporarily after exceeding limit", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 1,
      windowMs: 5_000, // short window so timestamp expires after block
      blockOnExcessMs: 10_000,
      purgeInterval: 1000,
    });
    limiter.check("a"); // call 1 at t=0
    limiter.check("a"); // call 2 → exceeds, blocked for 10s
    vi.advanceTimersByTime(5_000);
    expect(limiter.check("a").allowed).toBe(false); // still blocked (5s < 10s)
    vi.advanceTimersByTime(5_001); // t=10.001s — block expired, first timestamp expired (5s window)
    expect(limiter.check("a").allowed).toBe(true); // block expired + window cleared
  });

  it("peek does not register the attempt", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter.peek("a");
    limiter.peek("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reset clears a specific key", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter.check("a");
    limiter.check("b");
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(false);
  });

  it("purgeExpired removes old entries and returns count", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 5, windowMs: 10_000 });
    limiter.check("a");
    limiter.check("b");
    vi.advanceTimersByTime(10_001);
    const purged = limiter.purgeExpired();
    expect(purged).toBe(2);
    expect(limiter.size).toBe(0);
  });

  it("auto-purges periodically based on call count", () => {
    const limiter = new SlidingWindowRateLimiter({
      maxRequests: 10,
      windowMs: 5_000,
      purgeInterval: 3,
    });
    limiter.check("a"); // call 1
    limiter.check("b"); // call 2
    // Advance time so a and b expire
    vi.advanceTimersByTime(5_001);
    limiter.check("c"); // call 3 — triggers purge, a and b removed
    expect(limiter.size).toBe(1); // only c remains
  });

  it("tracks remaining correctly", () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(limiter.check("a").remaining).toBe(2);
    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
  });
});
