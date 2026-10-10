import { afterEach, describe, expect, it } from "vitest";
import { flagEnvKey, isFlagEnabled, listDeclaredFlags, stableBucket } from "./flags";

const KEYS = [
  "FEATURE_SCAN_QUEUE",
  "FEATURE_SCAN_QUEUE_ROLLOUT",
  "FEATURE_REALTIME_SSE",
  // También las públicas: sin esto, un test que deje una puesta se la hereda el
  // siguiente y el fallo aparece en el test equivocado.
  "NEXT_PUBLIC_FEATURE_SCAN_QUEUE",
  "NEXT_PUBLIC_FEATURE_SCAN_QUEUE_ROLLOUT",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("feature flags (A5)", () => {
  it("normaliza el nombre a FEATURE_SCREAMING_SNAKE", () => {
    expect(flagEnvKey("scanQueue")).toBe("FEATURE_SCAN_QUEUE");
    expect(flagEnvKey("realtimeSse")).toBe("FEATURE_REALTIME_SSE");
    expect(flagEnvKey("distributed-cache")).toBe("FEATURE_DISTRIBUTED_CACHE");
  });

  it("está apagado por defecto (fail-closed)", () => {
    expect(isFlagEnabled("scanQueue")).toBe(false);
  });

  it("acepta los valores truthy/falsy", () => {
    process.env.FEATURE_SCAN_QUEUE = "on";
    expect(isFlagEnabled("scanQueue")).toBe(true);
    process.env.FEATURE_SCAN_QUEUE = "off";
    expect(isFlagEnabled("scanQueue")).toBe(false);
    process.env.FEATURE_SCAN_QUEUE = "basura";
    expect(isFlagEnabled("scanQueue")).toBe(false);
  });

  it("un valor explícito gana sobre el rollout", () => {
    process.env.FEATURE_SCAN_QUEUE = "false";
    process.env.FEATURE_SCAN_QUEUE_ROLLOUT = "100";
    expect(isFlagEnabled("scanQueue")).toBe(false);
  });

  it("rollout a 100 activa para cualquiera; a 0 no activa para nadie", () => {
    process.env.FEATURE_SCAN_QUEUE_ROLLOUT = "100";
    expect(isFlagEnabled("scanQueue", { userId: "u1" })).toBe(true);
    process.env.FEATURE_SCAN_QUEUE_ROLLOUT = "0";
    expect(isFlagEnabled("scanQueue", { userId: "u1" })).toBe(false);
  });

  it("el canary es determinista y estable por usuario", () => {
    process.env.FEATURE_SCAN_QUEUE_ROLLOUT = "50";
    const a1 = isFlagEnabled("scanQueue", { userId: "user-123" });
    const a2 = isFlagEnabled("scanQueue", { userId: "user-123" });
    expect(a1).toBe(a2);
    expect(stableBucket("scanQueue:user-123")).toBe(stableBucket("scanQueue:user-123"));
  });

  it("un rollout parcial reparte a los usuarios entre activado y apagado", () => {
    process.env.FEATURE_SCAN_QUEUE_ROLLOUT = "30";
    let on = 0;
    for (let i = 0; i < 200; i++) if (isFlagEnabled("scanQueue", { userId: `u${i}` })) on++;
    expect(on).toBeGreaterThan(0);
    expect(on).toBeLessThan(200);
  });

  it("listDeclaredFlags reporta los flags declarados por env", () => {
    process.env.FEATURE_SCAN_QUEUE = "1";
    const flags = listDeclaredFlags();
    expect(flags.find((f) => f.envKey === "FEATURE_SCAN_QUEUE")?.enabled).toBe(true);
  });

  // --- Superficie cliente: NEXT_PUBLIC_* -------------------------------------
  // Un `process.env.FEATURE_X` sin prefijo público no llega al bundle del
  // navegador: Next.js lo sustituye por undefined. Sin la variante pública, un flag
  // leído desde un componente "use client" estaría SIEMPRE apagado, y el cambio que
  // gobierna sería decorativo.

  it("en el navegador lee el flag por su clave NEXT_PUBLIC_", () => {
    process.env.NEXT_PUBLIC_FEATURE_SCAN_QUEUE = "on";
    expect(isFlagEnabled("scanQueue")).toBe(true);
  });

  it("el rollout también se resuelve por la clave pública", () => {
    process.env.NEXT_PUBLIC_FEATURE_SCAN_QUEUE_ROLLOUT = "100";
    expect(isFlagEnabled("scanQueue", { userId: "u1" })).toBe(true);
  });

  it("mantiene fail-closed en el navegador si no hay ninguna de las dos claves", () => {
    expect(isFlagEnabled("scanQueue")).toBe(false);
  });

  it("la clave desnuda manda sobre la pública: el servidor no cambia", () => {
    process.env.NEXT_PUBLIC_FEATURE_SCAN_QUEUE = "on";
    process.env.FEATURE_SCAN_QUEUE = "off";
    expect(isFlagEnabled("scanQueue")).toBe(false);
  });

  it("listDeclaredFlags incluye los flags declarados solo con clave pública", () => {
    process.env.NEXT_PUBLIC_FEATURE_SCAN_QUEUE = "1";
    const f = listDeclaredFlags().find((x) => x.name === "SCAN_QUEUE");
    expect(f?.envKey).toBe("NEXT_PUBLIC_FEATURE_SCAN_QUEUE");
    expect(f?.enabled).toBe(true);
  });
});
