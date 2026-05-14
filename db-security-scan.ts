import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.DATABASE_URL;

async function scanSecurity() {
  console.log("🔍 INICIANDO ESCANEO DE SEGURIDAD RLS...\n");

  if (!dbUrl) {
    console.error("❌ DATABASE_URL no encontrada.");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    const query = `
      SELECT 
        tablename, 
        rowsecurity,
        EXISTS (
          SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || tablename)::regclass
        ) as has_policies
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `;

    const { rows } = await pool.query(query);

    console.log("| Tabla | RLS Habilitado | Tiene Polticas | Estado |");
    console.log("| :--- | :---: | :---: | :--- |");

    let vulnerabilities = 0;

    for (const row of rows) {
      const isSecure = row.rowsecurity && row.has_policies;
      let status = "✅ Protegida";
      
      if (!row.rowsecurity) {
        status = "🚨 RLS DESACTIVADO";
        vulnerabilities++;
      } else if (!row.has_policies) {
        status = "⚠️ Sin Polticas (Bloqueada o Vulnerable)";
        vulnerabilities++;
      }

      console.log(`| ${row.tablename} | ${row.rowsecurity ? 'S' : 'No'} | ${row.has_policies ? 'S' : 'No'} | ${status} |`);
    }

    console.log(`\n📊 Resumen: ${vulnerabilities} posibles vulnerabilidades detectadas en ${rows.length} tablas.`);

  } catch (error) {
    console.error("❌ Error durante el escaneo:", error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

scanSecurity();
