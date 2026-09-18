import { describe, it, expect, vi } from "vitest";

interface TaskConfig<P, R> {
  id: string;
  run: (payload: P) => Promise<R>;
}

vi.mock("@trigger.dev/sdk/v3", () => ({
  task: vi.fn((config: unknown) => config),
}));

import { helloJob } from "./hello.trigger";

describe("Trigger: hello-world", () => {
  const task = helloJob as unknown as TaskConfig<
    { name: string },
    { message: string; timestamp: string }
  >;

  it("registra el task con el id correcto", () => {
    expect(task.id).toBe("hello-world");
  });

  it("saluda con el nombre recibido y devuelve un timestamp ISO válido", async () => {
    const result = await task.run({ name: "Ada" });
    expect(result.message).toContain("Ada");
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
