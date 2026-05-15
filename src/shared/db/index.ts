import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schemas';

const isProduction = process.env.NODE_ENV === 'production';

// En desarrollo, queremos preservar la conexión a la base de datos a través de recargas HMR
const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const dbUrl = process.env.DATABASE_URL;
let cleanUrl = dbUrl;

if (dbUrl) {
  try {
    const parsedUrl = new URL(dbUrl);
    parsedUrl.searchParams.delete('sslmode');
    cleanUrl = parsedUrl.toString();
  } catch (err) {
    console.error('Error parsing DATABASE_URL:', err);
  }
}

const sslConfig = {
  rejectUnauthorized: false,
};

const conn = globalForDb.conn ?? new Pool({
  connectionString: cleanUrl,
  max: isProduction ? 2 : 10,
  idleTimeoutMillis: isProduction ? 15000 : 30000,
  connectionTimeoutMillis: 5000,
  ssl: cleanUrl?.includes('supabase') || cleanUrl?.includes('pooler') ? sslConfig : undefined,
});

// Instance for background workers or tasks that need to bypass RLS
const directConn = new Pool({
  connectionString: process.env.DIRECT_URL || cleanUrl,
  max: 2,
  ssl: (process.env.DIRECT_URL || cleanUrl)?.includes('supabase') ? sslConfig : undefined,
});

if (!isProduction) globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
export const directDb = drizzle(directConn, { schema });
