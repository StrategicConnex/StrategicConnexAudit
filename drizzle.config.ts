import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Usando DIRECT_URL para migraciones
const dbUrl = process.env.DIRECT_URL;

if (!dbUrl) {
  throw new Error("La variable de entorno DIRECT_URL falta en la configuración de drizzle");
}

export default defineConfig({
  schema: "./src/shared/db/schemas/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: dbUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  },
});
