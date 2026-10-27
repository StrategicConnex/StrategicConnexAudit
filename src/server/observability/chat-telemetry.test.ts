import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureAppLog } = vi.hoisted(() => ({
  mockCaptureAppLog: vi.fn(async () => undefined),
}));

vi.mock("./app-logs-sink", () => ({
  captureAppLog: mockCaptureAppLog,
}));

import { recordUnverifiedCitations } from "./chat-telemetry";

interface CapturedEntry {
  level: string;
  message: string;
  source: string;
  context: Record<string, unknown>;
}

describe("recordUnverifiedCitations", () => {
  beforeEach(() => {
    mockCaptureAppLog.mockClear();
  });

  it("registra el evento con nivel warn y solo identificadores/conteo", async () => {
    await recordUnverifiedCitations({
      correlationId: "req-1",
      taskType: "general-chat",
      count: 2,
    });

    expect(mockCaptureAppLog).toHaveBeenCalledOnce();
    const entry = mockCaptureAppLog.mock.calls[0]?.[0] as CapturedEntry;

    expect(entry).toEqual({
      level: "warn",
      message: "chat.citation.unverified",
      source: "chat",
      context: {
        correlationId: "req-1",
        taskType: "general-chat",
        count: 2,
      },
    });

    // Privacidad: ni prompt ni contenido de hallazgo, solo 3 claves.
    expect(Object.keys(entry.context).sort()).toEqual([
      "correlationId",
      "count",
      "taskType",
    ]);
  });

  it("no escribe nada si el conteo no es positivo", async () => {
    await recordUnverifiedCitations({
      correlationId: "req-1",
      taskType: "general-chat",
      count: 0,
    });
    await recordUnverifiedCitations({
      correlationId: "req-1",
      taskType: "general-chat",
      count: -3,
    });

    expect(mockCaptureAppLog).not.toHaveBeenCalled();
  });
});
