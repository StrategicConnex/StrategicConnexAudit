import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql, eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { randomUUID } from 'crypto';

// Cargar variables de entorno
dotenv.config({ path: '.env.local' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dbUrl = process.env.DATABASE_URL;

// Definiciones mnimas de esquema para el test
const roleEnum = pgEnum("role", ["admin", "manager", "client"]);
const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
});

const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

async function runTest() {
  console.log("🚀 INICIANDO PRUEBA DE FUEGO RLS (Versin Autocontenida)\n");

  if (!dbUrl) {
    console.error("❌ DATABASE_URL no encontrada en .env.local");
    return;
  }

  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const db = drizzle(pool);

  const userA_Id = randomUUID();
  const userB_Id = randomUUID();
  const projectId = randomUUID();

  try {
    // 1. Setup
    console.log("Step 1: Creando usuarios de prueba...");
    await db.insert(users).values([
      { id: userA_Id, email: `usera_${Date.now()}@test.com`, fullName: "Usuario A" },
      { id: userB_Id, email: `userb_${Date.now()}@test.com`, fullName: "Usuario B" }
    ]);

    // 2. Usuario A crea proyecto
    console.log(`Step 2: Usuario A crea el proyecto [${projectId}]`);
    await db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: userA_Id, role: 'authenticated' });
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql`SET ROLE authenticated`);
      
      await tx.insert(projects).values({
        id: projectId,
        ownerId: userA_Id,
        name: "Proyecto Secreto de A",
        domain: "https://secreto-a.com"
      });
    });
    console.log("✅ Proyecto creado exitosamente por Usuario A.");

    // 3. PRUEBA 1: Usuario B intenta leer
    console.log("\n🔥 PRUEBA 1: Usuario B intenta LEER el proyecto de Usuario A...");
    const resultRead = await db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: userB_Id, role: 'authenticated' });
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql`SET ROLE authenticated`);
      
      return await tx.select().from(projects).where(eq(projects.id, projectId));
    });

    if (resultRead.length === 0) {
      console.log("🛡️ RLS EXITOSO: Usuario B no pudo ver el proyecto de A (0 filas devueltas).");
    } else {
      console.error("❌ ERROR DE SEGURIDAD: Usuario B pudo leer el proyecto de A.");
      console.log("Contenido ledo:", resultRead[0]);
    }

    // 4. PRUEBA 2: Usuario B intenta borrar
    console.log("\n🔥 PRUEBA 2: Usuario B intenta BORRAR el proyecto de Usuario A...");
    const resultDelete = await db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: userB_Id, role: 'authenticated' });
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql`SET ROLE authenticated`);
      
      return await tx.delete(projects).where(eq(projects.id, projectId)).returning();
    });

    if (resultDelete.length === 0) {
      console.log("🛡️ RLS EXITOSO: Usuario B no pudo borrar el proyecto de A (0 filas afectadas).");
    } else {
      console.error("❌ ERROR DE SEGURIDAD: Usuario B pudo borrar el proyecto de A.");
    }

    // 5. Verificacin Final
    const finalCheck = await db.transaction(async (tx) => {
      const claims = JSON.stringify({ sub: userA_Id, role: 'authenticated' });
      await tx.execute(sql`SELECT set_config('request.jwt.claims', ${claims}, true)`);
      await tx.execute(sql`SET ROLE authenticated`);
      
      return await tx.select().from(projects).where(eq(projects.id, projectId));
    });

    if (finalCheck.length === 1) {
      console.log("\n✅ VERIFICACIN FINAL: El proyecto sigue intacto para su dueo (Usuario A).");
    }

  } catch (error) {
    console.error("\n❌ Error inesperado durante el test:", error);
  } finally {
    await pool.end();
    console.log("\n--- Fin de la Prueba de Fuego ---");
    process.exit(0);
  }
}

runTest();
