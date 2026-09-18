import { describe, it, expect } from "vitest";
import { ok, err, unwrap, map, flatMap, Result } from "./result";

describe("Result<T,E>", () => {
  it("ok creates success result", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it("err creates error result", () => {
    const result = err("fail");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("fail");
  });

  it("unwrap returns value for ok", () => {
    expect(unwrap(ok(42))).toBe(42);
  });

  it("unwrap throws for err", () => {
    expect(() => unwrap(err("fail"))).toThrow("fail");
  });

  it("map transforms ok value", () => {
    const result = map(ok(42), (x) => x * 2);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(84);
  });

  it("map propagates err", () => {
    const result = map(err("fail") as Result<number, string>, (x) => x * 2);
    expect(result.ok).toBe(false);
  });

  it("flatMap chains operations", () => {
    const result = flatMap(ok(42), (x) => ok(x * 2));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(84);
  });

  it("flatMap propagates err", () => {
    const result = flatMap(ok(42), () => err("fail"));
    expect(result.ok).toBe(false);
  });
});
