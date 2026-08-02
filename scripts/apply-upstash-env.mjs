#!/usr/bin/env node
/**
 * apply-upstash-env.mjs — Aplica credenciales nuevas de Upstash Redis en un
 * solo paso: .env.local, .env.test y (opcionalmente) el env de Vercel.
 *
 * Uso:
 *   # Solo archivos locales
 *   npx tsx scripts/apply-upstash-env.mjs --url https://xxxx.upstash.io --token yyy
 *
 *   # También actualiza Vercel (requiere npx vercel link hecho + login)
 *   npx tsx scripts/apply-upstash-env.mjs --url https://xxxx.upstash.io --token yyy --vercel
 *
 * Flags:
 *   --url <REST_URL>     URL REST de la DB nueva (obligatorio)
 *   --token <REST_TOKEN> Token REST (obligatorio). Alternativa sin argv:
 *                        export UPSTASH_REDIS_REST_TOKEN=yyy  (evita el historial del shell)
 *   --vercel             Actualiza también las variables en Vercel (producción + preview)
 *   --no-local           Omite la edición de .env.local / .env.test
 *
 * Nota Windows: execSync usa cmd.exe (shell:true); los comandos vercel funcionan ahí.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function parseArgs(argv) {
  const args = { vercel: false, local: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--token") args.token = argv[++i];
    else if (a === "--vercel") args.vercel = true;
    else if (a === "--no-local") args.local = false;
  }
  // El token también puede venir por env var para no exponerlo en argv
  // (visible en ps / historial del shell).
  if (!args.token && process.env.UPSTASH_REDIS_REST_TOKEN) {
    args.token = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  return args;
}

function upsertEnv(file, url, token) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    console.log(`⚠️  ${file} no existe — omitido`);
    return false;
  }
  const set = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}="${value}"`;
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  };
  set("UPSTASH_REDIS_REST_URL", url);
  set("UPSTASH_REDIS_REST_TOKEN", token);
  writeFileSync(file, content, "utf8");
  return true;
}

const args = parseArgs(process.argv.slice(2));

if (!args.url || !args.token) {
  console.error(
    "❌ Uso: npx tsx scripts/apply-upstash-env.mjs --url <URL> --token <TOKEN> [--vercel]\n" +
    "   (o exporta UPSTASH_REDIS_REST_TOKEN para evitar el token en argv)"
  );
  process.exit(1);
}
if (!/^https:\/\/[\w-]+\.upstash\.io$/.test(args.url)) {
  console.error(`❌ URL inválida: ${args.url} (esperado https://xxxx.upstash.io)`);
  process.exit(1);
}

// 1. Archivos locales
if (args.local) {
  for (const f of [".env.local", ".env.test"]) {
    if (upsertEnv(f, args.url, args.token)) {
      console.log(`✅ ${f} actualizado`);
    }
  }
}

// 2. Vercel
if (args.vercel) {
  const sh = (cmd) => execSync(cmd, { stdio: "inherit", shell: true });
  try {
    sh("npx vercel whoami");
  } catch {
    console.error("❌ No autenticado en Vercel. Ejecuta: npx vercel login");
    process.exit(1);
  }
  try {
    for (const name of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
      const value = name === "UPSTASH_REDIS_REST_URL" ? args.url : args.token;
      console.log(`↻ Removiendo ${name} de production/preview...`);
      try {
        sh(`npx vercel env rm ${name} production preview --yes`);
      } catch {
        // no existía — ok
      }
      console.log(`↻ Agregando ${name} a production/preview...`);
      sh(`echo "${value}" | npx vercel env add ${name} production preview`);
    }
    console.log("✅ Env de Vercel actualizado. Verifica con: npx vercel env ls");
    console.log("↻ El redeploy se dispara automáticamente al guardar.");
  } catch (e) {
    console.error("❌ Falló la actualización en Vercel:", e.message);
    process.exit(1);
  }
}

console.log("\n🟢 Listo. Verifica la conectividad con: npx tsx scripts/verify-upstash.mjs");
