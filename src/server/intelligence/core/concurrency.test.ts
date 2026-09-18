import { describe, it, expect } from "vitest";
import { Semaphore, runWithPool } from "./concurrency";

describe("Semaphore", () => {
  it("allows up to maxConcurrency concurrent runs", async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 10));
      running--;
    };

    await Promise.all([sem.run(task), sem.run(task), sem.run(task)]);
    expect(maxRunning).toBe(2);
  });

  it("throws if maxConcurrency < 1", () => {
    expect(() => new Semaphore(0)).toThrow("maxConcurrency debe ser >= 1");
  });

  it("reports pending and active counts", async () => {
    const sem = new Semaphore(1);
    const blocker = sem.run(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Wait a tick for the first task to acquire
    await new Promise((r) => setTimeout(r, 1));
    expect(sem.active).toBe(1);

    const second = sem.run(async () => "done");
    expect(sem.pending).toBe(1);

    await blocker;
    const result = await second;
    expect(result).toBe("done");
    expect(sem.active).toBe(0);
    expect(sem.pending).toBe(0);
  });

  it("propagates errors from tasks", async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");
  });
});

describe("runWithPool", () => {
  it("returns results in order", async () => {
    const tasks = [
      async () => 1,
      async () => 2,
      async () => 3,
    ];
    const results = await runWithPool(tasks, 2);
    expect(results).toEqual([
      { success: true, value: 1 },
      { success: true, value: 2 },
      { success: true, value: 3 },
    ]);
  });

  it("captures errors as failure results", async () => {
    const tasks = [
      async () => "ok",
      async () => {
        throw new Error("boom");
      },
      async () => "also ok",
    ];
    const results = await runWithPool(tasks, 2);
    expect(results[0]).toEqual({ success: true, value: "ok" });
    expect(results[1]).toEqual({ success: false, error: "boom" });
    expect(results[2]).toEqual({ success: true, value: "also ok" });
  });

  it("respects concurrency limit", async () => {
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 6 }, () => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return running;
    });

    await runWithPool(tasks, 2);
    expect(maxRunning).toBe(2);
  });
});
