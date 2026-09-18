import { describe, it, expect, vi } from "vitest";
import { RealtimeProvider } from "./realtime";

describe("RealtimeProvider", () => {
  it("subscribes and receives events", () => {
    const provider = new RealtimeProvider();
    const callback = vi.fn();
    provider.subscribe("test", callback);
    provider.emit("test", { message: "hello" });
    expect(callback).toHaveBeenCalledWith({ message: "hello" });
  });

  it("unsubscribe stops events", () => {
    const provider = new RealtimeProvider();
    const callback = vi.fn();
    const unsubscribe = provider.subscribe("test", callback);
    unsubscribe();
    provider.emit("test", { message: "hello" });
    expect(callback).not.toHaveBeenCalled();
  });

  it("multiple subscribers on same channel", () => {
    const provider = new RealtimeProvider();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    provider.subscribe("test", cb1);
    provider.subscribe("test", cb2);
    provider.emit("test", { message: "hello" });
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
});
