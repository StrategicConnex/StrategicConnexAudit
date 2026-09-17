import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { envSecrets } from "@/shared/config/env-secrets";

/**
 * field-crypto.ts — Cifrado de secretos en reposo (P1-5).
 *
 * AES-256-GCM con clave de `DATA_ENCRYPTION_KEY` (32 bytes hex). Formato:
 * `v1:<iv-hex>:<tag-hex>:<cipher-hex>`. Valores legacy sin prefijo se
 * devuelven tal cual (ruta de migración: se re-cifran al rotar).
 *
 * Fail-closed: sin clave configurada, encrypt lanza (mejor un 500 visible
 * que un secreto en claro silencioso).
 */

const PREFIX = "v1:";

function getKey(): Buffer {
  const raw = envSecrets.dataEncryptionKey;
  if (!raw) {
    throw new Error("DATA_ENCRYPTION_KEY no configurada: genera 32 bytes hex (openssl rand -hex 32).");
  }
  const key = Buffer.from(raw.trim(), "hex");
  if (key.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY inválida: se esperan 32 bytes en hex.");
  }
  return key;
}

export function encryptField(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptField(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy en claro
  const key = getKey();
  const [, ivHex = "", tagHex = "", encHex = ""] = stored.split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/** Comparación de secreto en tiempo constante (acepta legacy en claro). */
export function fieldEquals(stored: string, candidate: string): boolean {
  try {
    const a = Buffer.from(decryptField(stored), "utf8");
    const b = Buffer.from(candidate, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Vista enmascarada para UI/APIs (primeros 8 + …). */
export function maskSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const plain = stored.startsWith(PREFIX) ? "••••••••" : stored.slice(0, 8);
  return `${plain}.…`;
}
