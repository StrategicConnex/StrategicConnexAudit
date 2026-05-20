import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schemas';
import * as fs from 'fs';
import * as path from 'path';

// Mantener el tipo de Drizzle para la inicialización perezosa
type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

let lazyDb: DbInstance | undefined;
let lazyDirectDb: DbInstance | undefined;

// Función para obtener el certificado Supabase CA de forma perezosa
function getSupabaseCa(): string | undefined {
  const caPath = path.join(process.cwd(), 'src/shared/db/supabase-ca.crt');
  try {
    return fs.readFileSync(caPath, 'utf8');
  } catch {
    console.warn('[DB] Supabase CA certificate not found at', caPath);
    return undefined;
  }
}

// Inicialización perezosa de la base de datos principal (db)
function initDb(): DbInstance {
  if (lazyDb) return lazyDb;

  const isProduction = process.env.NODE_ENV === 'production';
  const supabaseCa = getSupabaseCa();

  // SECURITY: Set DB_ALLOW_INSECURE_SSL=true ONLY in environments where Supabase
  // or a proxy uses self-signed certificates (e.g. local Supabase, Supabase pooler).
  // In production on Vercel + Supabase Cloud this should be left unset (defaults to false).
  const allowInsecureSsl = process.env.DB_ALLOW_INSECURE_SSL === 'true';

  if (isProduction && allowInsecureSsl) {
    console.warn('[DB] WARNING: DB_ALLOW_INSECURE_SSL is enabled in production. Ensure this is intentional.');
  }

  // En desarrollo, queremos preservar la conexión a la base de datos a través de recargas HMR
  const globalForDb = globalThis as unknown as {
    conn: Pool | undefined;
  };

  const dbUrl = process.env.DATABASE_URL;
  let cleanUrl = dbUrl;

  console.log("[DB Init] DATABASE_URL =", dbUrl ? dbUrl.replace(/:[^:@/]+@/, ":****@") : "undefined");

  if (dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      parsedUrl.searchParams.delete('sslmode');
      cleanUrl = parsedUrl.toString();
      console.log("[DB Init] cleanUrl =", cleanUrl.replace(/:[^:@/]+@/, ":****@"));
    } catch (err) {
      console.error('Error parsing DATABASE_URL:', err);
    }
  }

  // SSL config: use provided CA if available
  const sslConfig = {
    ca: supabaseCa,
    rejectUnauthorized: supabaseCa ? true : !allowInsecureSsl,
  };

  const conn = globalForDb.conn ?? new Pool({
    connectionString: cleanUrl,
    max: isProduction ? 2 : 10,
    idleTimeoutMillis: isProduction ? 15000 : 30000,
    connectionTimeoutMillis: 5000,
    ssl: cleanUrl?.includes('supabase') || cleanUrl?.includes('pooler') ? sslConfig : undefined,
  });

  if (!isProduction) globalForDb.conn = conn;

  lazyDb = drizzle(conn, { schema });
  return lazyDb;
}

// Inicialización perezosa de la base de datos directa para Workers/Tasks (directDb)
function initDirectDb(): DbInstance {
  if (lazyDirectDb) return lazyDirectDb;

  const supabaseCa = getSupabaseCa();
  const allowInsecureSsl = process.env.DB_ALLOW_INSECURE_SSL === 'true';

  const dbUrl = process.env.DATABASE_URL;
  let cleanUrl = dbUrl;

  if (dbUrl) {
    try {
      const parsedUrl = new URL(dbUrl);
      parsedUrl.searchParams.delete('sslmode');
      cleanUrl = parsedUrl.toString();
    } catch (err) {
      console.error('Error parsing DATABASE_URL for Direct Init:', err);
    }
  }

  // Instance for background workers or tasks that need to bypass RLS.
  // Uses DIRECT_URL which should point to db.[ref].supabase.co:5432 or pooler:6543.
  const directUrl = process.env.DIRECT_URL || cleanUrl;
  const directUrlParsed = (() => {
    try {
      const u = new URL(directUrl ?? '');
      // Only delete if we are manually providing SSL config in the Pool object
      u.searchParams.delete('sslmode');
      u.searchParams.delete('supavisor_session_id');
      return u.toString();
    } catch {
      return directUrl;
    }
  })();

  const directSslConfig = (directUrl ?? '').includes('supabase')
    ? { 
        ca: supabaseCa,
        rejectUnauthorized: supabaseCa ? true : !allowInsecureSsl 
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
      if (typeof value === 'function') {
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
    }
  });
}

// Exportación final a través de Proxies robustos
export const db = createLazyProxy(initDb);
export const directDb = createLazyProxy(initDirectDb);
