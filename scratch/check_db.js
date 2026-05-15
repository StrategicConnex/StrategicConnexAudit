const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres.qwebfomwtwxxbkxbrrwm:Juanbarby*123@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log("Checking public.users...");
    const publicUsers = await pool.query('SELECT id, email, role FROM public.users');
    console.log("Public Users:", publicUsers.rows);

    console.log("Checking auth.users (if accessible)...");
    try {
      const authUsers = await pool.query('SELECT id, email FROM auth.users');
      console.log("Auth Users:", authUsers.rows);
    } catch (e) {
      console.log("Cannot read auth.users directly:", e.message);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();
