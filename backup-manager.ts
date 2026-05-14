import * as dotenv from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.DATABASE_URL;

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'backups');
  const backupFile = path.join(backupDir, `strategic_audit_pro_backup_${timestamp}.sql`);

  console.log("🚀 INICIANDO BACKUP DE EMERGENCIA...");

  if (!dbUrl) {
    console.error("❌ DATABASE_URL no encontrada en .env.local");
    return;
  }

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
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
    console.log(`   Tamao: ${(fs.statSync(backupFile).size / 1024).toFixed(2)} KB`);

  } catch (error) {
    console.error("❌ Error durante el backup:", error);
  } finally {
    await pool.end();
  }
}

runBackup();
