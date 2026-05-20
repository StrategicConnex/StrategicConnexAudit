import { NextRequest } from "next/server";
import { db } from "@/shared/db";
import { developerApiKeys } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";
import crypto from "crypto";

export interface ApiAuthContext {
  userId: string;
  keyId: string;
}

/**
 * Valida un token Bearer en las cabeceras HTTP contra la tabla developerApiKeys.
 * Utilizado para el acceso programático a la API de Inteligencia (Bulk / Headless).
 */
export async function validateApiKey(req: NextRequest): Promise<ApiAuthContext | null> {
  const authHeader = req.headers.get("authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.split(" ")[1];
  
  if (!rawKey) {
    return null;
  }

  // Las llaves reales tendrían un prefijo (ej: sa_live_xyz). 
  // Hasheamos el token en plano proporcionado para compararlo de forma segura
  const hashedKey = crypto
    .createHash("sha256")
    .update(rawKey)
    .digest("hex");

  try {
    const keyRecord = await db.query.developerApiKeys.findFirst({
      where: eq(developerApiKeys.hashedKey, hashedKey)
    });

    if (!keyRecord) {
      return null;
    }

    // Verificar si expiró
    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      return null;
    }

    // Actualizar la fecha de último uso asíncronamente sin bloquear
    db.update(developerApiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(developerApiKeys.id, keyRecord.id))
      .catch(err => console.error("Fallo al actualizar lastUsedAt en ApiKey:", err));

    return {
      userId: keyRecord.userId,
      keyId: keyRecord.id
    };
  } catch (err) {
    console.error("Error validando API Key:", err);
    return null;
  }
}
