import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schemas";
import { logger } from "@/lib/logger";
import { SUPABASE_CA_PEM } from "./supabase-ca";

// Mantener el tipo de Drizzle para la inicialización perezosa
type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let lazyDb: DbInstance | undefined;
let lazyDirectDb: DbInstance | undefined;

/**
 * CA del pooler de Supabase. Orden de resolución (el primero que aplique):
 *   1. `SUPABASE_CA_CRT` (env): el operador puede inyectar el PEM tal cual o en
 *      base64 — útil para dashboards que no aceptan multiline.
 *   2. CA embebido (`supabase-ca.ts`): viaja dentro del bundle, así que NO
 *      depende del cwd ni del filesystem del runtime (el fallo real de
 *      producción del 2026-10-12..18: en los workers de Trigger.dev
 *      `fs.readFileSync(<cwd>/src/shared/db/supabase-ca.crt)` no encontraba el
 *      archivo -> TLS handshake "self-signed certificate in certificate chain"
 *      -> 15 tasks FAILED de forma sostenida).
 * Un valor de env no reconocible NO desactiva la verificación: se ignora y se
 * usa el embebido (fail-closed al CA válido, nunca a insecure).
 */
function getSupabaseCa(): string {
  const envCa = process.env.SUPABASE_CA_CRT?.trim();
  if (envCa) {
    if (envCa.startsWith("-----BEGIN CERTIFICATE")) return envCa;
    try {
      const decoded = Buffer.from(envCa, "base64").toString("utf8");
      if (decoded.startsWith("-----BEGIN CERTIFICATE")) return decoded;
    } catch {
      // no es base64 válido: ignorar, abajo va el CA embebido
    }
    logger.warn(
      "[DB] SUPABASE_CA_CRT presente pero no reconocible (ni PEM ni base64 de PEM); usando CA embebido"
    );
  }
  return SUPABASE_CA_PEM;
}

// Inicialización perezosa de la base de datos principal (db)
function initDb(): DbInstance {
  if (lazyDb) return lazyDb;

  const isProduction = process.env.NODE_ENV === "production";
  const supabaseCa = getSupabaseCa();

  // SECURITY: Set DB_ALLOW_INSECURE_SSL=true ONLY in environments where Supabase
  // or a proxy uses self-signed certificates (e.g. local Supabase, Supabase pooler).
  // In production on Vercel + Supabase Cloud this should be left unset (defaults to false).
  const allowInsecureSsl = process.env.DB_ALLOW_INSECURE_SSL === "true";

  if (isProduction && allowInsecureSsl) {
    logger.warn(
      "[DB] WARNING: DB_ALLOW_INSECURE_SSL is enabled in production. Ensure this is intentional."
    );
  }

  // En desarrollo, queremos preservar la conexión a la base de datos a través de recargas HMR
  const globalForDb = globalThis as unknown as {
    conn: Pool | undefined;
  };

  const dbUrl = process.env.DATABASE_URL;
  let cleanUrl = dbUrl;

  logger.info(
    "[DB Init] DATABASE_URL =",
    dbUrl ? dbUrl.replace(/:[^:@/]+@/, ":****@") : "undefined"
  );

  if (dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      parsedUrl.searchParams.delete("sslmode");
      cleanUrl = parsedUrl.toString();
      logger.info("[DB Init] cleanUrl =", cleanUrl.replace(/:[^:@/]+@/, ":****@"));
    } catch (err) {
      logger.error("Error parsing DATABASE_URL:", err);
    }
  }

  // SSL config: use provided CA if available.
  // El flag explícito del operador gana al CA bundled: hay entornos (pooler
  // con cadena autofirmada) donde el CA no cubre el endpoint y sin esto `db`
  // queda muerto aunque DIRECT_URL funcione. En producción el warning de
  // arriba deja constancia cuando se activa.
  const sslConfig = {
    ca: supabaseCa,
    rejectUnauthorized: allowInsecureSsl ? false : true,
  };

  const conn =
    globalForDb.conn ??
    new Pool({
      connectionString: cleanUrl,
      max: isProduction ? 2 : 10,
      idleTimeoutMillis: isProduction ? 15000 : 30000,
      connectionTimeoutMillis: 5000,
      ssl: cleanUrl?.includes("supabase") || cleanUrl?.includes("pooler") ? sslConfig : undefined,
    });

  if (!isProduction) globalForDb.conn = conn;

  lazyDb = drizzle(conn, { schema });
  return lazyDb;
}

// Inicialización perezosa de la base de datos directa para Workers/Tasks (directDb)
function initDirectDb(): DbInstance {
  if (lazyDirectDb) return lazyDirectDb;

  const supabaseCa = getSupabaseCa();
  const allowInsecureSsl = process.env.DB_ALLOW_INSECURE_SSL === "true";

  const dbUrl = process.env.DATABASE_URL;
  let cleanUrl = dbUrl;

  if (dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      parsedUrl.searchParams.delete("sslmode");
      cleanUrl = parsedUrl.toString();
    } catch (err) {
      logger.error("Error parsing DATABASE_URL for Direct Init:", err);
    }
  }

  // Instance for background workers or tasks that need to bypass RLS.
  // Uses DIRECT_URL which should point to db.[ref].supabase.co:5432 or pooler:6543.
  const directUrl = process.env.DIRECT_URL || cleanUrl;
  const directUrlParsed = (() => {
    try {
      const u = new URL(directUrl ?? "");
      // Only delete if we are manually providing SSL config in the Pool object
      u.searchParams.delete("sslmode");
      return u.toString();
    } catch {
      return directUrl;
    }
  })();

  const directSslConfig = (directUrl ?? "").includes("supabase")
    ? {
        ca: supabaseCa,
        rejectUnauthorized: allowInsecureSsl ? false : true,
      }
    : undefined;

  const directConn = new Pool({
    connectionString: directUrlParsed,
    max: 2,
    connectionTimeoutMillis: 10000,
    ssl: directSslConfig,
  });

  lazyDirectDb = drizzle(directConn, { schema });
  return lazyDirectDb;
}

// Factoría para crear proxies perezosos que enlazan correctamente el contexto 'this' de Drizzle
function createLazyProxy(initializer: () => DbInstance): DbInstance {
  return new Proxy({} as DbInstance, {
    get(_, prop, receiver) {
      const instance = initializer();
      const value = Reflect.get(instance, prop, receiver);
      if (typeof value === "function") {
        return value.bind(instance);
      }
      return value;
    },
    set(_, prop, value, receiver) {
      const instance = initializer();
      return Reflect.set(instance, prop, value, receiver);
    },
    has(_, prop) {
      const instance = initializer();
      return Reflect.has(instance, prop);
    },
    ownKeys() {
      const instance = initializer();
      return Reflect.ownKeys(instance);
    },
    getOwnPropertyDescriptor(_, prop) {
      const instance = initializer();
      return Reflect.getOwnPropertyDescriptor(instance, prop);
    },
  });
}

// Exportación final a través de Proxies robustos
export const db = createLazyProxy(initDb);
export const directDb = createLazyProxy(initDirectDb);
