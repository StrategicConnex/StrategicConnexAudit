import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { connectionFor } from '../lib/db-connection.mjs';

dotenv.config({ path: '.env.local', quiet: true });

const dbUrl = process.env.DATABASE_URL;

/**
 * `--check` = prueba de conexión seca: se conecta, confirma el modo TLS
 * negociado y sale SIN volcar nada. Es lo que permite verificar la política
 * SSL de `scripts/lib/db-connection.mjs` sin generar un backup completo.
 */
const CHECK_ONLY = process.argv.includes('--check');

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  const backupFile = path.join(backupDir, `strategic_audit_pro_backup_${timestamp}.sql`);

  console.log(CHECK_ONLY ? "🔎 PRUEBA DE CONEXIÓN (--check, no se escribe nada)..." : "🚀 INICIANDO BACKUP DE EMERGENCIA...");

  if (!dbUrl) {
    console.error("❌ DATABASE_URL no encontrada en .env.local");
    process.exitCode = 2;
    return;
  }

  if (!CHECK_ONLY && !fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  // Política TLS centralizada (ver scripts/lib/db-connection.mjs): el `sslmode`
  // del DSN se retira para que pg no pueda pisar el objeto `ssl`. El flag
  // anterior (`rejectUnauthorized: DB_ALLOW_INSECURE_SSL === 'true'`) además
  // estaba INVERTIDO: con DB_ALLOW_INSECURE_SSL=true exigía verificación
  // estricta y rompía la conexión contra el pooler de Supabase.
  const pool = new Pool({ ...connectionFor(dbUrl), max: 1 });

  try {
    if (CHECK_ONLY) {
      const client = await pool.connect();
      try {
        const info = await client.query(`SELECT current_database() AS db, version() AS version`);
        // Se mira el socket DE ESTE LADO: por el pooler (Supavisor) la conexión
        // backend↔pooler es local y `pg_stat_ssl.ssl` diría `false` aunque
        // nuestro tramo sí vaya cifrado, así que no sirve como señal.
        const socket = (client as unknown as { connection?: { stream?: { encrypted?: boolean } } })
          .connection?.stream;
        const row = info.rows[0] ?? {};
        console.log(`✅ Conexión OK — base: ${row.db} · TLS en el socket: ${socket?.encrypted === true ? 'sí' : 'no'}`);
        console.log(`   servidor: ${String(row.version ?? '').split(' ').slice(0, 2).join(' ')}`);
      } finally {
        client.release();
      }
      return;
    }

    // 1. Obtener lista de tablas
    const tablesRes = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'drizzle_%'
    `);
    const tables = tablesRes.rows.map(r => r.tablename);

    let sqlContent = `-- STRATEGIC AUDIT PRO BACKUP\n-- Generated: ${new Date().toISOString()}\n\n`;
    sqlContent += `SET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`;

    for (const table of tables) {
      console.log(`📦 Procesando tabla: ${table}...`);
      sqlContent += `\n-- DATA FOR TABLE: ${table}\n`;
      
      const dataRes = await pool.query(`SELECT * FROM public."${table}"`);
      
      if (dataRes.rows.length === 0) {
        sqlContent += `-- (No data found in ${table})\n`;
        continue;
      }

      const columns = Object.keys(dataRes.rows[0]).map(c => `"${c}"`).join(', ');
      
      for (const row of dataRes.rows) {
        const values = Object.values(row).map(val => {
          if (val === null) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          return val;
        }).join(', ');
        
        sqlContent += `INSERT INTO public."${table}" (${columns}) VALUES (${values});\n`;
      }
    }

    fs.writeFileSync(backupFile, sqlContent);
    console.log(`\n✅ BACKUP COMPLETADO CON EXITO:`);
    console.log(`   Archivo: ${path.basename(backupFile)}`);
    console.log(`   Tamaño: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error("❌ Error durante el backup:", error);
    process.exitCode = 2;
  } finally {
    await pool.end();
  }
}

runBackup();
