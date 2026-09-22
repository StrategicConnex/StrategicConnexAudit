import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Usando DIRECT_URL para migraciones
const dbUrl = process.env.DIRECT_URL;

if (!dbUrl) {
  // `drizzle-kit check` (integridad del journal) y `generate` NO conectan a la
  // BD: no deben fallar en CI cuando el secret DIRECT_URL no está configurado.
  // Las operaciones que SÍ conectan (migrate/push/studio) fallarán con un
  // error de conexión claro al intentarlo.
  console.warn(
    "[drizzle.config] DIRECT_URL no configurada — `check`/`generate` funcionan, " +
      "pero `migrate`/`push`/`studio` fallarán al conectar.",
  );
}

export default defineConfig({
  schema: "./src/shared/db/schemas/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder",
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
