/**
 * push.ts — Push Notification Utility
 *
 * Envía notificaciones push a los navegadores suscritos usando la Web Push API.
 * Se conecta con la tabla push_subscriptions para obtener los endpoints activos.
 *
 * Las VAPID keys se generan automáticamente si no existen y se almacenan
 * en variables de entorno (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
 *
 * Uso:
 *   import { sendPushNotification } from "@/server/notifications/push";
 *   await sendPushNotification({ title: "Alerta", body: "..." });
 */

import { eq, and, desc } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { pushSubscriptions } from "@/shared/db/schemas/push-subscriptions";
import type { PushSubscription } from "web-push";

// ═════════════════════════════════════════════════════════════════════════════
//  Tipos
// ═════════════════════════════════════════════════════════════════════════════

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  sent: number;
  failed: number;
  errors: string[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  VAPID Keys (lazy init)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Obtiene o genera las VAPID keys para Web Push.
 * Las keys se almacenan en process.env para persistencia durante el ciclo de vida.
 * En producción, configurar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en Vercel env vars.
 */
function getVapidKeys(): { publicKey: string; privateKey: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";

  if (!publicKey || !privateKey) {
    console.warn(
      "[Push] VAPID keys not configured. Configure en vars de entorno:\n" +
      "  1. npx web-push generate-vapid-keys\n" +
      "  2. Copiar VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY a .env.local o Vercel env vars"
    );
    return { publicKey: "", privateKey: "" };
  }

  return { publicKey, privateKey };
}

/**
 * Retorna la VAPID public key para que el frontend la use al suscribirse.
 * Si no hay keys configuradas, retorna null.
 */
export function getVapidPublicKey(): string | null {
  const keys = getVapidKeys();
  return keys.publicKey || null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Push Notification Sender
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Envía una notificación push a TODAS las suscripciones activas.
 * Las suscripciones que fallen (endpoint expirado) se marcan como inactivas.
 *
 * Fire-and-forget: nunca lanza excepciones. Use sendPushNotificationToAll
 * para enviar a todos los suscriptores, o sendToUser para filtrar por userId.
 */
export async function sendPushNotification(
  payload: PushNotificationPayload,
  subscription: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { publicKey, privateKey } = getVapidKeys();
    if (!publicKey || !privateKey) {
      console.warn("[Push] Cannot send: VAPID keys not configured");
      return false;
    }

    // web-push CJS interop: import dinmico devuelve el mdulo con exports en .default
    const mod = await import("web-push");
    const wp = (mod.default || mod) as typeof import("web-push");

    wp.setVapidDetails(
      "mailto:security@strategicaudit.pro",
      publicKey,
      privateKey,
    );

    const result = await wp.sendNotification(
      subscription as unknown as PushSubscription,
      JSON.stringify(payload),
      { TTL: 86400 }, // 24 hours TTL
    );

    return result.statusCode === 201;
  } catch (err: unknown) {
    const pushErr = err as { statusCode?: number; message?: string };
    // Si el error es 410 (Gone) o 404 (Not Found), el endpoint expiró
    if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
      console.warn("[Push] Subscription expired, will mark inactive:", pushErr.message?.slice(0, 100));
    } else {
      console.error("[Push] Failed to send:", pushErr.message?.slice(0, 200) || pushErr);
    }
    return false;
  }
}

/**
 * Envía una notificación a TODAS las suscripciones activas en la base de datos.
 */
export async function sendPushNotificationToAll(
  payload: PushNotificationPayload,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, errors: [] };

  try {
    const subscriptions = await directDb
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.active, "true"))
      .orderBy(desc(pushSubscriptions.createdAt));

    if (subscriptions.length === 0) {
      return result;
    }

    for (const sub of subscriptions) {
      const ok = await sendPushNotification(payload, sub.subscription);
      if (ok) {
        result.sent++;
      } else {
        result.failed++;
        // Marcar como inactiva si falló por endpoint expirado
        if (!ok) {
          try {
            await directDb
              .update(pushSubscriptions)
              .set({ active: "false", updatedAt: new Date() })
              .where(eq(pushSubscriptions.id, sub.id));
          } catch {
            // fail-safe
          }
        }
      }
    }
  } catch (err: unknown) {
    result.errors.push((err as Error).message || "Unknown error");
  }

  return result;
}

/**
 * Envía una notificación push a un usuario específico.
 */
export async function sendPushNotificationToUser(
  userId: string,
  payload: PushNotificationPayload,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, errors: [] };

  try {
    const subscriptions = await directDb
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.active, "true"),
        ),
      );

    for (const sub of subscriptions) {
      const ok = await sendPushNotification(payload, sub.subscription);
      if (ok) {
        result.sent++;
      } else {
        result.failed++;
        try {
          await directDb
            .update(pushSubscriptions)
            .set({ active: "false", updatedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id));
        } catch {
          // fail-safe
        }
      }
    }
  } catch (err: unknown) {
    result.errors.push((err as Error).message || "Unknown error");
  }

  return result;
}
