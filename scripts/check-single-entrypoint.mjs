#!/usr/bin/env node
/**
 * check-single-entrypoint.mjs — Next.js 16 exige UN solo entrypoint.
 *
 * `middleware.ts` fue renombrado a `proxy.ts`. Si ambos existen, `next build`
 * falla con:
 *
 *   Both middleware file "./src/middleware.ts" and proxy file "./src/proxy.ts"
 *   are detected. Please use "./src/proxy.ts" only.
 *
 * Ese mensaje no ofrece ninguna bandera de configuración: la única solución es
 * borrar el entrypoint viejo. Este guard lo detecta en segundos, antes de que
 * alguien pierda horas buscando un `exclude`/`include` que no existe.
 *
 * Uso: node scripts/check-single-entrypoint.mjs
 * Exit 1 si hay conflicto (ambos presentes).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const extensions = ["ts", "js", "tsx", "jsx", "mjs", "mts"];

const middlewareCandidates = extensions.flatMap((ext) => [
  `middleware.${ext}`,
  `src/middleware.${ext}`,
]);
const proxyCandidates = extensions.flatMap((ext) => [
  `proxy.${ext}`,
  `src/proxy.${ext}`,
]);

const foundMiddleware = middlewareCandidates.filter((file) =>
  existsSync(resolve(root, file))
);
const foundProxy = proxyCandidates.filter((file) => existsSync(resolve(root, file)));

if (foundMiddleware.length > 0 && foundProxy.length > 0) {
  console.error("❌ CONFLICTO: Next.js no permite ambos entrypoints.");
  console.error(`   Middleware: ${foundMiddleware.join(", ")}`);
  console.error(`   Proxy:      ${foundProxy.join(", ")}`);
  console.error("   Solución: eliminar el antiguo (middleware.*) y conservar proxy.*");
  console.error(
    "   No existe configuración de Next.js que permita los dos archivos."
  );
  process.exit(1);
}

if (foundMiddleware.length > 0) {
  console.warn(
    `⚠️  Encontrado ${foundMiddleware.join(", ")}. Next.js 16 usa proxy.ts: migrar o eliminar.`
  );
}

console.log(
  foundProxy.length > 0
    ? `✅ Entrypoint único: ${foundProxy.join(", ")}`
    : "✅ Check de entrypoint único: OK (sin proxy.ts, nada que validar)"
);
process.exit(0);
