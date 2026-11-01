#!/usr/bin/env node
/**
 * seed-contract-api-key.mjs — TD-20: modo efímero de la prueba de contrato en CI.
 *
 * Antes:
 * - El job `API Contract Test` era fail-closed sin `TEST_ENV`/`SCAUDIT_CONTRACT_BASE_URL`
 *   (no golpea producción desde 2026-10-10) y el owner no tenía a mano dónde
 *   poner las variables. Resultado: el paso en vivo quedaba en rojo.
 *
 * Qué hace este arnés (en CI, contra el Postgres EFÍMERO del step):
 * 1. Crea un usuario y proyecto fixture con ids fijos (idempotente).
 * 2. Genera una token tipo 'sa_live_…' efímero, guarda su SHA-256 en
 *    `developer_api_keys` (la autenticación real: src/server/intelligence/enterprise/api-auth.ts).
 * 3. Escribe la token EN CLARO en el archivo indicado (default
 *    `test-results/contract-api-key.txt`, gitignoreado en `.gitignore`). No
 *    imprime la token en stdout: si el job la necesita, la lee sincronizados en
 *    el paso de CI y hace `::add-mask::`.
 *
 * Uso LOCAL (Postgres local corriendo): node scripts/db/seed-contract-api-key.mjs
 */
import crypto from 'crypto';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scaudit_test?sslmode=disable';

/* ids fijos para reejecuciones idempotentes del arnés */
const TEST_USER_ID = '00000000-0000-4000-8000-0000000000c1';
const TEST_PROJECT_ID = '00000000-0000-4000-8000-0000000000c2';
const TEST_KEY_NAME = 'CI contract ephemeral key (TD-20)';

const outFile = process.env.CONTRACT_API_KEY_PATH || 'test-results/contract-api-key.txt';

const pool = new Pool({ connectionString });

try {
  // 1. user fixture (sin FK a auth.users: la tabla usa referencia lógica)
  await pool.query(
    `INSERT INTO users (id, email, full_name, role)
     VALUES ($1, $2, $3, 'client')
     ON CONFLICT (id) DO NOTHING;`,
    [TEST_USER_ID, 'td20-contract@team.test', 'TD-20 Contract Ephemeral'],
  );

  // 2. proyecto fixture (los endpoints públicos resuelven por owner/auth)
  await pool.query(
    `INSERT INTO projects (id, owner_id, name, domain)
     VALUES ($1, $2, 'TD-20 Ephemeral Project', 'https://td20-contract.test')
     ON CONFLICT (id) DO NOTHING;`,
    [TEST_PROJECT_ID, TEST_USER_ID],
  );

  // 3. key efímera: sha256 del token crudo (mismas reglas que producción)
  const rawToken = 'sa_live_' + crypto.randomBytes(24).toString('hex');
  const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
  await pool.query(
    `INSERT INTO developer_api_keys (id, user_id, name, key_prefix, hashed_key, scope)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
     ON CONFLICT (hashed_key) DO NOTHING;`,
    [TEST_USER_ID, TEST_KEY_NAME, rawToken.slice(0, 8), hashed, JSON.stringify([])],
  );

  // 4. guardo el token en el archivo (gitignoreado), nunca en stdout
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, rawToken + '\n', { encoding: 'utf8' });
  fs.chmodSync(outFile, 0o600);

  console.log('✅ Supabase/contacto de contrato preparado (TD-20 ephemeral)');
  console.log('   user/project idempotentes y token efímero en: ' + outFile);
  console.log('   (token NUNCA imprimida en stdout; el CI la lee con ::add-mask::)');
} catch (err) {
  console.error('\n❌ seed-contract-api-key falló: ' + err.message);
  await pool.end().catch(() => {});
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}
