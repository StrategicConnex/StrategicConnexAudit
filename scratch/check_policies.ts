
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.DATABASE_URL;

async function checkPolicies() {
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const { rows } = await pool.query(`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
    FROM pg_policies 
    WHERE tablename = 'projects';
  `);
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

checkPolicies().catch(console.error);
