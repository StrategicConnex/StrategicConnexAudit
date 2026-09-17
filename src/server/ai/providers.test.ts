import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAnthropicText, isAnthropicConfigured } from "./providers";

const OLD_KEY = process.env.ANTHROPIC_API_KEY;

function anthropicOk(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: "text", text }] }),
    text: async () => "",
  } as Response;
}

describe("providers — failover Anthropic (P2-1)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (OLD_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = OLD_KEY;
  });

  it("isAnthropicConfigured refleja la key", () => {
    expect(isAnthropicConfigured()).toBe(true);
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAnthropicConfigured()).toBe(false);
  });

  it("separa system y fusiona turnos consecutivos del mismo rol", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(anthropicOk("hola"));
    const res = await callAnthropicText({
      model: "m",
      messages: [
        { role: "system", content: "sys" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
      temperature: 0,
      maxTokens: 100,
      timeoutMs: 5000,
    });
    expect(res.content).toBe("hola");
    expect(res.modelUsed).toBe("anthropic/m");
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.system).toBe("sys");
    expect(body.messages).toEqual([{ role: "user", content: "a\n\nb" }]);
  });

  it("429 de Anthropic lanza con contexto", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => "rate" } as Response);
    await expect(
      callAnthropicText({
        model: "m",
        messages: [{ role: "user", content: "x" }],
        temperature: 0,
        maxTokens: 10,
        timeoutMs: 5000,
      })
    ).rejects.toThrow(/Anthropic 429/);
  });

  it("respuesta vacía lanza", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
      text: async () => "",
    } as Response);
    await expect(
      callAnthropicText({
        model: "m",
        messages: [{ role: "user", content: "x" }],
        temperature: 0,
        maxTokens: 10,
        timeoutMs: 5000,
      })
    ).rejects.toThrow(/vacía/);
  });
});
