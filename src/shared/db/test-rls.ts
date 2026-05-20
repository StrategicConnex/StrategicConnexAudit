import { db } from './index';
import { projects, users } from './schemas/index';
import { withRLS } from './rls';
import { eq } from 'drizzle-orm';
import { randomUUID as uuidv4 } from 'crypto';

async function testRLS() {
  console.log("🚀 Iniciando Prueba de Fuego: Row Level Security (RLS)\n");

  const userA_Id = uuidv4();
  const userB_Id = uuidv4();
  const projectId = uuidv4();

  try {
    // 1. Setup: Crear usuarios
    console.log("Step 1: Creando usuarios de prueba...");
    await db.insert(users).values([
      { id: userA_Id, email: `usera_${Date.now()}@test.com`, fullName: "Usuario A" },
      { id: userB_Id, email: `userb_${Date.now()}@test.com`, fullName: "Usuario B" }
    ]);

    // 2. Usuario A crea un proyecto
    console.log(`Step 2: Usuario A crea el proyecto [${projectId}]`);
    await withRLS(userA_Id, async (tx) => {
      await tx.insert(projects).values({
        id: projectId,
        ownerId: userA_Id,
        name: "Proyecto Secreto de A",
        domain: "https://secreto-a.com"
      });
    });
    console.log("✅ Proyecto creado exitosamente por Usuario A.");

    // 3. PRUEBA DE FUEGO: Usuario B intenta leer el proyecto de A
    console.log("\n🔥 PRUEBA 1: Usuario B intenta LEER el proyecto de Usuario A...");
    const resultRead = await withRLS(userB_Id, async (tx) => {
      return await tx.select().from(projects).where(eq(projects.id, projectId));
    });

    if (resultRead.length === 0) {
      console.log("🛡️ RLS EXITOSO: Usuario B no pudo ver el proyecto de A (0 filas devueltas).");
    } else {
      console.error("❌ ERROR DE SEGURIDAD: Usuario B pudo leer el proyecto de A.");
    }

    // 4. PRUEBA DE FUEGO: Usuario B intenta BORRAR el proyecto de A
    console.log("\n🔥 PRUEBA 2: Usuario B intenta BORRAR el proyecto de Usuario A...");
    const resultDelete = await withRLS(userB_Id, async (tx) => {
      return await tx.delete(projects).where(eq(projects.id, projectId)).returning();
    });

    if (resultDelete.length === 0) {
      console.log("🛡️ RLS EXITOSO: Usuario B no pudo borrar el proyecto de A (0 filas afectadas).");
    } else {
      console.error("❌ ERROR DE SEGURIDAD: Usuario B pudo borrar el proyecto de A.");
    }

    // 5. Verificamos que el proyecto sigue ahí para Usuario A
    const finalCheck = await withRLS(userA_Id, async (tx) => {
      return await tx.select().from(projects).where(eq(projects.id, projectId));
    });

    if (finalCheck.length === 1) {
      console.log("\n✅ VERIFICACIÓN: El proyecto sigue intacto para su dueño (Usuario A).");
    }

  } catch (error) {
    console.error("\n❌ Error durante la prueba:", error);
  } finally {
    console.log("\n--- Fin de la Prueba de Fuego ---");
    process.exit(0);
  }
}

testRLS();
