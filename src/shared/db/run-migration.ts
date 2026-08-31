import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from "@/lib/logger";

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DIRECT_URL;
if (!connectionString) {
  throw new Error('DIRECT_URL is not set');
}

const parsedUrl = new URL(connectionString);
parsedUrl.searchParams.delete('sslmode');
const cleanUrl = parsedUrl.toString();

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  logger.info('Running migration...');
  try {
    const migrationSql = fs.readFileSync(path.join(__dirname, '../../../drizzle/0001_silky_ikaris.sql'), 'utf-8');
    
    // Split by statement-breakpoint and run each statement
    const statements = migrationSql.split('--> statement-breakpoint').map(s => s.trim()).filter(s => s.length > 0);
    
    for (const stmt of statements) {
      logger.info('Executing:', stmt.substring(0, 50) + '...');
      try {
        await pool.query(stmt);
        logger.info('Success');
      } catch (err: unknown) {
        logger.info('Failed:', err instanceof Error ? err.message : String(err));
        // Ignore if column already exists
      }
    }
    
    logger.info('Migration complete');
  } catch (error) {
    logger.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

run();
