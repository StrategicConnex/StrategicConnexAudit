import { describe, it, expect } from "vitest";
import {
  HELP_TEXT,
  buildSlackBlocks,
  formatAckResult,
  formatError,
  formatScanPending,
  formatStatus,
  parseCommandText,
  shortId,
} from "./commands";

describe("parseCommandText", () => {
  it("parsea el comando y sus argumentos", () => {
    const result = parseCommandText("status 550e8400-e29b-41d4-a716-446655440000");
    expect(result).toEqual({
      ok: true,
      command: {
        name: "status",
        args: ["550e8400-e29b-41d4-a716-446655440000"],
        raw: "status 550e8400-e29b-41d4-a716-446655440000",
      },
    });
  });

  it("tolera el prefijo /scaudit y @SCAudit", () => {
    for (const input of ["/scaudit ack f-1", "@SCAudit ack f-1", "scaudit ack f-1"]) {
      const result = parseCommandText(input);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.command).toMatchObject({ name: "ack", args: ["f-1"] });
    }
  });

  it("acepta alias en español y '?'", () => {
    const estado = parseCommandText("estado p1");
    expect(estado.ok && estado.command.name).toBe("status");
    const ayuda = parseCommandText("?");
    expect(ayuda.ok && ayuda.command.name).toBe("help");
    const reconocer = parseCommandText("reconocer f-9");
    expect(reconocer.ok && reconocer.command.name).toBe("ack");
  });

  it("normaliza espacios múltiples", () => {
    const result = parseCommandText("  ack    f-1   ");
    expect(result.ok && result.command.args).toEqual(["f-1"]);
  });

  it("vacío o solo prefijo → error de ayuda", () => {
    for (const input of ["", "   ", "/scaudit"]) {
      const result = parseCommandText(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("help");
    }
  });

  it("comando desconocido → error con el token recibido", () => {
    const result = parseCommandText("borrar-todo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("borrar-todo");
      expect(result.error).toContain("help");
    }
  });
});

describe("formatStatus", () => {
  const base = {
    projectName: "Acme",
    domain: "acme.com",
    recent: [],
    lastAuditAt: null,
  };

  it("informa el reparto por severidad", () => {
    const response = formatStatus({
      ...base,
      openCount: 4,
      bySeverity: { critical: 1, high: 2, info: 1 },
    });
    expect(response.text).toContain("*Acme* — acme.com");
    expect(response.text).toContain("Hallazgos abiertos: 4 (1 critical, 2 high, 1 info)");
    expect(response.error).toBe(false);
  });

  it("sin escaneo completado dice 'sin datos', no una fecha inventada", () => {
    const response = formatStatus({ ...base, openCount: 0, bySeverity: {} });
    expect(response.text).toContain("Último escaneo completado: sin datos");
    // 0 abiertos SÍ es un dato: se ha consultado y no hay nada abierto.
    expect(response.text).toContain("Hallazgos abiertos: 0");
  });

  it("muestra la fecha ISO cuando existe", () => {
    const response = formatStatus({
      ...base,
      openCount: 1,
      bySeverity: { low: 1 },
      lastAuditAt: "2026-10-01T10:00:00.000Z",
    });
    expect(response.text).toContain("Último escaneo completado: 2026-10-01T10:00:00.000Z");
  });

  it("genera un botón de acuse por hallazgo reciente (máx 5)", () => {
    const recent = Array.from({ length: 7 }, (_, i) => ({
      id: `550e8400-e29b-41d4-a716-44665544000${i}`,
      severity: "high",
      title: `Hallazgo ${i}`,
    }));
    const response = formatStatus({ ...base, openCount: 7, bySeverity: { high: 7 }, recent });
    expect(response.actions).toHaveLength(5);
    expect(response.actions?.[0]).toEqual({
      text: "Acusar 550e8400",
      value: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});

describe("respuestas del bot", () => {
  it("formatError marca error", () => {
    const response = formatError("algo falló");
    expect(response.error).toBe(true);
    expect(response.text).toContain("algo falló");
  });

  it("scan es explícitamente pendiente: no finge haber lanzado nada", () => {
    const response = formatScanPending("acme.com");
    expect(response.error).toBe(true);
    expect(response.text).toContain("acme.com");
    expect(response.text).toContain("No se ha lanzado nada");
  });

  it("help no es un error y lista los comandos reales", () => {
    expect(HELP_TEXT).toContain("status <projectId>");
    expect(HELP_TEXT).toContain("ack <findingId>");
    expect(HELP_TEXT).toContain("pendiente");
  });

  it("formatAckResult informa el SLA cuando existe", () => {
    const withSla = formatAckResult({
      findingId: "12345678-aaaa",
      status: "acknowledged",
      dueAt: "2026-10-07T10:00:00.000Z",
    });
    expect(withSla.text).toContain("12345678");
    expect(withSla.text).toContain("SLA hasta: 2026-10-07T10:00:00.000Z");

    const noSla = formatAckResult({ findingId: "f-1", status: "acknowledged", dueAt: null });
    expect(noSla.text).toContain("Sin SLA asignado");
  });

  it("buildSlackBlocks añade una sección por acción con action_id estable", () => {
    const blocks = buildSlackBlocks({
      text: "hola",
      error: false,
      actions: [{ text: "Acusar abcd", value: "f-1" }],
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "section" });
    const actions = blocks[1] as { type: string; elements: Array<Record<string, unknown>> };
    expect(actions.type).toBe("actions");
    expect(actions.elements[0]).toMatchObject({ action_id: "scaudit_ack", value: "f-1" });
  });

  it("shortId recorta los uuid largos", () => {
    expect(shortId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400");
    expect(shortId("abc")).toBe("abc");
  });
});
