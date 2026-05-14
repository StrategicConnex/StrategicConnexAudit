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

const conn = globalForDb.conn ?? new Pool({
  connectionString: cleanUrl,
  // Optimización para Vercel Serverless / Edge
  // En producción, cada función serverless atiende un solo request concurrente,
  // por lo que max: 2 es ideal para evitar agotar las conexiones del pooler de Supabase.
  max: isProduction ? 2 : 10,
  // Cerrar conexiones inactivas rápidamente en serverless para liberar recursos
  idleTimeoutMillis: isProduction ? 15000 : 30000,
  // No esperar indefinidamente por una conexión
  connectionTimeoutMillis: 5000,
  ssl: cleanUrl?.includes('supabase.com') || cleanUrl?.includes('pooler') ? { rejectUnauthorized: false } : undefined,
});

if (!isProduction) globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
