/**
 * Parche de carga para scripts tsx fuera de Next.js: redirige 'server-only'
 * a un stub vacío (mismo comportamiento que el alias de vitest.config.ts).
 * Uso: importado como primer línea en src/scripts/e2e-ai-router.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require("module");
const path = require("path");
const stub = path.resolve(__dirname, "stubs", "server-only-empty.cjs");
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "server-only") return stub;
  return orig.call(this, request, ...args);
};
