/**
 * Sentry — contrato de inicialización de los tres procesos (SDK 11.4.0).
 *
 * Fija dos cosas que se pueden romper sin que nada avise:
 *
 * 1. Ningún config debe volver a registrar `beforeSendTransaction`. Con
 *    `traceLifecycle` en `'stream'` —el default del SDK— ese hook se ignora en
 *    silencio (`maybeWarnAboutIgnoredTransactionOptions` de `@sentry/core`), y
 *    el propio SDK lo marca como deprecado y a eliminar en la v12. Tenerlo
 *    puesto solo prometía un scrub de trazas que nunca ocurría.
 * 2. El scrub de PII de `beforeSend` sigue vivo en los tres procesos: al quitar
 *    el hook muerto no se puede perder el que sí corre.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({
  init: initMock,
  replayIntegration: () => ({ name: "Replay" }),
  captureRouterTransitionStart: () => {},
}));

const DSN =
  "https://publickey123@o4511488296026112.ingest.us.sentry.io/4511488301137920";

/** Forma mínima de las opciones que nos interesan (sin `any`). */
interface ScrubResult {
  request?: { headers?: Record<string, unknown>; data?: unknown; cookies?: unknown };
  user?: unknown;
}
interface InitOptions {
  beforeSend?: (event: ScrubResult, hint: unknown) => ScrubResult;
  beforeSendTransaction?: unknown;
}

/** Cargadores estáticos: vite no resuelve imports con plantilla. */
const LOADERS: Record<string, () => Promise<unknown>> = {
  "server (node)": () => import("../sentry.server.config"),
  edge: () => import("../sentry.edge.config"),
  "cliente (navegador)": () => import("./instrumentation-client"),
};

async function initOptionsOf(load: () => Promise<unknown>): Promise<InitOptions> {
  vi.resetModules();
  initMock.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", DSN);
  vi.stubEnv("NODE_ENV", "production");
  await load();
  const options = initMock.mock.calls.at(-1)?.[0];
  expect(options, "Sentry.init no fue llamado al importar el config").toBeDefined();
  return options as InitOptions;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe.each(Object.entries(LOADERS))("Sentry — %s", (_label, load) => {
  it("no registra `beforeSendTransaction` (ignorado con traceLifecycle 'stream')", async () => {
    const options = await initOptionsOf(load);
    expect(options.beforeSendTransaction).toBeUndefined();
  });

  it("conserva `beforeSend` y limpia PII (cabeceras, cuerpo, cookies y user)", async () => {
    const options = await initOptionsOf(load);
    expect(typeof options.beforeSend).toBe("function");

    const event: ScrubResult = {
      request: {
        headers: {
          cookie: "sb=secreto",
          Authorization: "Bearer token-real",
          "x-api-key": "sa_live_no-debe-viajar",
          "user-agent": "vitest",
        },
        data: { password: "hunter2" },
        cookies: { sb: "secreto" },
      },
      user: { id: "u-1", email: "alguien@example.test" },
    };

    const scrubbed = options.beforeSend!(event, {});

    // Cabeceras sensibles enmascaradas (el match es case-insensitive).
    expect(scrubbed.request?.headers?.cookie).toBe("[Filtered]");
    expect(scrubbed.request?.headers?.Authorization).toBe("[Filtered]");
    expect(scrubbed.request?.headers?.["x-api-key"]).toBe("[Filtered]");
    // …y las inocuas intactas: el scrub no debe vaciar el evento entero.
    expect(scrubbed.request?.headers?.["user-agent"]).toBe("vitest");
    // Cuerpo, cookies y contexto de usuario eliminados.
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
  });
});
