import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

async function testConnection() {
  const dbUrl = process.env.DATABASE_URL;
  console.log("DB URL:", dbUrl ? dbUrl.replace(/:[^:@/]+@/, ":****@") : "undefined");

  if (!dbUrl) return;

  const caPath = path.join(process.cwd(), 'src/shared/db/supabase-ca.crt');
  let ca: string | undefined;
  try {
    ca = fs.readFileSync(caPath, 'utf8');
    console.log("CA cert found, length:", ca.length);
  } catch {
    console.log("CA cert not found at", caPath);
  }

  let cleanUrl = dbUrl;
  try {
    const parsedUrl = new URL(dbUrl);
    parsedUrl.searchParams.delete('sslmode');
    cleanUrl = parsedUrl.toString();
    console.log("Clean URL:", cleanUrl.replace(/:[^:@/]+@/, ":****@"));
  } catch (err) {
    console.error("Error parsing DB URL:", err);
  }

  const pool = new Pool({
    connectionString: cleanUrl,
    ssl: {
      ca,
      rejectUnauthorized: false
    }
  });

  try {
    console.log("Connecting...");
    const client = await pool.connect();
    console.log("Connected successfully!");
    const res = await client.query('SELECT NOW()');
    console.log("Result:", res.rows[0]);
    client.release();
  } catch (err) {
    console.error("Connection failed:", err);
  } finally {
    await pool.end();
  }
}

testConnection();
