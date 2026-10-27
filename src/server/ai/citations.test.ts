import { describe, expect, it } from "vitest";
import { parseCitations, toCitedFindings, type CitedFinding } from "./citations";

const SPF: CitedFinding = { id: "f-1", title: "SPF ausente" };
const DMARC: CitedFinding = { id: "f-2", title: "DMARC ausente" };

describe("parseCitations", () => {
  it("convierte un marcador válido en referencia numerada", () => {
    const result = parseCitations("Falta SPF [[finding:f-1]].", [SPF]);

    expect(result.text).toBe("Falta SPF [[ref:1]].");
    expect(result.references).toEqual([{ id: "f-1", title: "SPF ausente" }]);
    expect(result.unverifiedCount).toBe(0);
  });

  it("no inventa referencias: un id desconocido queda como texto y se cuenta", () => {
    const result = parseCitations("Riesgo [[finding:inventado]] según el modelo.", [SPF]);

    expect(result.text).toBe("Riesgo [[finding:inventado]] según el modelo.");
    expect(result.references).toEqual([]);
    expect(result.unverifiedCount).toBe(1);
  });

  it("trata ids vacíos o en blanco como intentos no verificados", () => {
    const empty = parseCitations("A [[finding:]] B", [SPF]);
    expect(empty.text).toBe("A [[finding:]] B");
    expect(empty.references).toEqual([]);
    expect(empty.unverifiedCount).toBe(1);

    const blank = parseCitations("A [[finding:   ]] B", [SPF]);
    expect(blank.text).toBe("A [[finding:   ]] B");
    expect(blank.references).toEqual([]);
    expect(blank.unverifiedCount).toBe(1);
  });

  it("deja intacto un marcador sin cerrar (no es un marcador completo)", () => {
    const result = parseCitations("Texto [[finding:f-1 sin cierre", [SPF]);

    expect(result.text).toBe("Texto [[finding:f-1 sin cierre");
    expect(result.references).toEqual([]);
    expect(result.unverifiedCount).toBe(0);
  });

  it("deduplica citas repetidas del mismo hallazgo", () => {
    const result = parseCitations(
      "[[finding:f-1]] y otra vez [[finding:f-1]]",
      [SPF],
    );

    expect(result.text).toBe("[[ref:1]] y otra vez [[ref:1]]");
    expect(result.references).toEqual([{ id: "f-1", title: "SPF ausente" }]);
    expect(result.unverifiedCount).toBe(0);
  });

  it("numera en orden de primera aparición, no en el orden del conjunto permitido", () => {
    const result = parseCitations(
      "Primero [[finding:f-2]], después [[finding:f-1]].",
      [SPF, DMARC],
    );

    expect(result.text).toBe("Primero [[ref:1]], después [[ref:2]].");
    expect(result.references).toEqual([
      { id: "f-2", title: "DMARC ausente" },
      { id: "f-1", title: "SPF ausente" },
    ]);
  });

  it("solo devuelve los hallazgos realmente citados", () => {
    const result = parseCitations("Solo hablo de [[finding:f-1]].", [SPF, DMARC]);

    expect(result.references).toEqual([{ id: "f-1", title: "SPF ausente" }]);
  });

  it("preserva el título como dato: no lo interpreta ni lo escapa", () => {
    const malicious: CitedFinding = {
      id: "f-x",
      title: '<img src=x onerror="alert(1)">',
    };

    const result = parseCitations("[[finding:f-x]]", [malicious]);

    expect(result.text).toBe("[[ref:1]]");
    expect(result.references[0]?.title).toBe('<img src=x onerror="alert(1)">');
  });

  it("un id con payload HTML no coincide con el conjunto validado", () => {
    const result = parseCitations(
      "[[finding:<script>alert(1)</script>]]",
      [SPF],
    );

    expect(result.text).toBe("[[finding:<script>alert(1)</script>]]");
    expect(result.references).toEqual([]);
    expect(result.unverifiedCount).toBe(1);
  });

  it("no toca tokens que no son marcadores de finding", () => {
    const result = parseCitations("Ya verificado [[ref:99]] y [[ref:1]].", [SPF]);

    expect(result.text).toBe("Ya verificado [[ref:99]] y [[ref:1]].");
    expect(result.references).toEqual([]);
    expect(result.unverifiedCount).toBe(0);
  });

  it("tolera un conjunto permitido con duplicados", () => {
    const result = parseCitations("[[finding:f-1]]", [SPF, { ...SPF }]);

    expect(result.references).toEqual([{ id: "f-1", title: "SPF ausente" }]);
  });
});

describe("toCitedFindings", () => {
  it("extrae findings y selectedFinding, deduplicando por id", () => {
    const result = toCitedFindings({
      findings: [
        { id: "f-1", title: "SPF ausente", description: "detalle" },
        { id: "f-2", title: "DMARC ausente" },
      ],
      selectedFinding: { id: "f-1", title: "SPF ausente" },
    });

    expect(result).toEqual([
      { id: "f-1", title: "SPF ausente" },
      { id: "f-2", title: "DMARC ausente" },
    ]);
  });

  it("descarta formas inválidas sin lanzar", () => {
    const result = toCitedFindings({
      findings: [
        null,
        "texto",
        { id: "", title: "sin id" },
        { id: "f-1" },
        { id: "f-2", title: 42 },
        { id: "f-3", title: "válido" },
      ],
      selectedFinding: { id: "f-4", title: "seleccionado" },
    });

    expect(result).toEqual([
      { id: "f-3", title: "válido" },
      { id: "f-4", title: "seleccionado" },
    ]);
  });

  it("devuelve vacío para contexto nulo o sin hallazgos", () => {
    expect(toCitedFindings(null)).toEqual([]);
    expect(toCitedFindings(undefined)).toEqual([]);
    expect(toCitedFindings({})).toEqual([]);
  });
});
