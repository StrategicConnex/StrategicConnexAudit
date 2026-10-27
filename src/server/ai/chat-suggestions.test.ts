import { describe, expect, it } from "vitest";
import esMessages from "../../../messages/es.json";
import enMessages from "../../../messages/en.json";
import {
  buildCriticalSuggestion,
  recentCriticalFindings,
  suggestionFingerprint,
  toSuggestionFindings,
  type SuggestionFinding,
} from "./chat-suggestions";

const NOW = new Date("2026-10-27T12:00:00.000Z");
const INVESTIGATION_ID = "22222222-2222-4222-8222-222222222222";

function finding(overrides: Partial<SuggestionFinding> = {}): SuggestionFinding {
  return {
    id: "f-1",
    severity: "critical",
    createdAt: new Date("2026-10-26T10:00:00.000Z"),
    investigationId: INVESTIGATION_ID,
    ...overrides,
  };
}

function build(
  findings: SuggestionFinding[],
  locale: "es" | "en" = "es",
  investigationId: string | null | undefined = INVESTIGATION_ID,
) {
  return buildCriticalSuggestion({
    findings,
    investigationId,
    locale,
    messages: locale === "es" ? esMessages : enMessages,
    now: NOW,
  });
}

describe("recentCriticalFindings", () => {
  it("solo conserva críticos dentro de la ventana de 7 días, ordenados por id", () => {
    const result = recentCriticalFindings(
      [
        finding({ id: "f-b" }),
        finding({ id: "f-a" }),
        finding({ id: "f-old", createdAt: new Date("2026-10-19T00:00:00.000Z") }),
        finding({ id: "f-high", severity: "high" }),
      ],
      NOW,
    );

    expect(result.map((item) => item.id)).toEqual(["f-a", "f-b"]);
  });

  it("excluye fechas futuras", () => {
    const result = recentCriticalFindings(
      [finding({ createdAt: new Date("2026-10-28T00:00:00.000Z") })],
      NOW,
    );

    expect(result).toEqual([]);
  });
});

describe("suggestionFingerprint", () => {
  it("es estable ante el orden y deduplica ids", () => {
    const a = suggestionFingerprint(["f-b", "f-a", "f-a"], NOW);
    const b = suggestionFingerprint(["f-a", "f-b"], NOW);

    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{32}$/);
  });

  it("cambia cuando avanza la ventana o cambia el conjunto", () => {
    const base = suggestionFingerprint(["f-a"], NOW);
    const nextDay = suggestionFingerprint(
      ["f-a"],
      new Date("2026-10-28T12:00:00.000Z"),
    );
    const otherSet = suggestionFingerprint(["f-a", "f-b"], NOW);

    expect(nextDay).not.toBe(base);
    expect(otherSet).not.toBe(base);
  });
});

describe("buildCriticalSuggestion", () => {
  it("genera la plantilla localizada en español (singular)", () => {
    const suggestion = build([finding()]);

    expect(suggestion).not.toBeNull();
    expect(suggestion?.text).toBe(
      "Hay 1 hallazgo crítico reciente. ¿Revisamos el plan de remediación?",
    );
    expect(suggestion?.ctaLabel).toBe("Ver plan de remediación");
    expect(suggestion?.investigationId).toBe(INVESTIGATION_ID);
    expect(suggestion?.findingIds).toEqual(["f-1"]);
    expect(suggestion?.fingerprint).toMatch(/^[a-f0-9]{32}$/);
  });

  it("usa el plural localizado en español", () => {
    const suggestion = build([
      finding({ id: "f-1" }),
      finding({ id: "f-2" }),
    ]);

    expect(suggestion?.text).toBe(
      "Hay 2 hallazgos críticos recientes. ¿Revisamos el plan de remediación?",
    );
  });

  it("genera la plantilla localizada en inglés", () => {
    const suggestion = build(
      [finding({ id: "f-1" }), finding({ id: "f-2" })],
      "en",
    );

    expect(suggestion?.text).toBe(
      "There are 2 recent critical findings. Shall we review the remediation plan?",
    );
    expect(suggestion?.ctaLabel).toBe("View remediation plan");
  });

  it("no sugiere nada sin hallazgos críticos recientes", () => {
    expect(build([])).toBeNull();
    expect(build([finding({ severity: "high" })])).toBeNull();
    expect(
      build([finding({ createdAt: new Date("2026-10-01T00:00:00.000Z") })]),
    ).toBeNull();
  });

  it("no sugiere nada sin una investigación real para el CTA", () => {
    expect(build([finding({ investigationId: null })], "es", null)).toBeNull();
  });

  it("usa la investigación del hallazgo cuando no hay una activa", () => {
    const suggestion = build([finding()], "es", undefined);

    expect(suggestion?.investigationId).toBe(INVESTIGATION_ID);
  });

  it("el fingerprint no depende del orden de los hallazgos", () => {
    const one = build([finding({ id: "f-a" }), finding({ id: "f-b" })]);
    const two = build([finding({ id: "f-b" }), finding({ id: "f-a" })]);

    expect(one?.fingerprint).toBe(two?.fingerprint);
  });
});

describe("toSuggestionFindings", () => {
  it("normaliza hallazgos válidos y descarta el resto", () => {
    const result = toSuggestionFindings([
      { id: "f-1", severity: "critical", createdAt: new Date().toISOString() },
      { id: "f-2", severity: "high", createdAt: new Date() },
      { id: "f-3", severity: "critical", createdAt: new Date(), investigationId: "inv-1" },
      null,
      { id: "f-4" },
      { id: 5, severity: "critical", createdAt: new Date() },
      { id: "f-5", severity: "critical", createdAt: 123 },
    ]);

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ id: "f-1", severity: "critical" });
    expect(result[1]).toMatchObject({ id: "f-2", investigationId: null });
    expect(result[2]).toMatchObject({ id: "f-3", investigationId: "inv-1" });
  });

  it("devuelve vacío si el valor no es un array", () => {
    expect(toSuggestionFindings(undefined)).toEqual([]);
    expect(toSuggestionFindings({ id: "f-1" })).toEqual([]);
  });
});
