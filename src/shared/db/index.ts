import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schemas';
import * as fs from 'fs';
import * as path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

// Load Supabase CA Certificate
const caPath = path.join(process.cwd(), 'src/shared/db/supabase-ca.crt');
let supabaseCa: string | undefined;
try {
  supabaseCa = fs.readFileSync(caPath, 'utf8');
} catch (err) {
  console.warn('[DB] Supabase CA certificate not found at', caPath);
}

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

const isPooler = (directUrl ?? '').includes('pooler');
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

if (!isProduction) globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export const directDb = drizzle(directConn, { schema });
