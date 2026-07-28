/**
 * POST /api/notifications/push-subscribe
 * DELETE /api/notifications/push-subscribe
 *
 * Gestiona suscripciones a notificaciones push del navegador.
 *
 * POST: Registra una nueva suscripción (endpoint + keys del PushSubscription).
 * DELETE: Desactiva una suscripción por endpoint.
 *
 * Autenticación: requiere usuario autenticado via Supabase.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/shared/lib/supabase/server";
import { directDb } from "@/shared/db";
import { pushSubscriptions } from "@/shared/db/schemas/push-subscriptions";
import { eq, and } from "drizzle-orm";
import { getVapidPublicKey } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

/**
 * POST — Registrar una nueva suscripción push.
 *
 * Body esperado:
 * {
 *   subscription: PushSubscriptionJSON  // { endpoint, keys: { p256dh, auth } }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}));
    const subscription = body.subscription as Record<string, unknown> | undefined;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { success: false, error: "Invalid subscription object" },
        { status: 400 },
      );
    }

    const endpoint = subscription.endpoint as string;

    // 3. Check if already subscribed
    const existing = await directDb
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Reactivate if inactive
      await directDb
        .update(pushSubscriptions)
        .set({
          subscription: subscription as Record<string, unknown>,
          active: "true",
          userAgent: req.headers.get("user-agent") || undefined,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.id, existing[0].id));

      return NextResponse.json({ success: true, status: "reactivated" });
    }

    // 4. Insert new subscription
    await directDb.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint,
      subscription: subscription as Record<string, unknown>,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ success: true, status: "subscribed" });
  } catch (error: unknown) {
    console.error("[PushSubscribe] POST error:", (error as Error).message);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE — Desuscribir (marcar como inactivo).
 *
 * Body esperado:
 * {
 *   endpoint: string  // el endpoint de la PushSubscription a desactivar
 * }
 */
export async function DELETE(req: NextRequest) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}));
    const endpoint = body.endpoint as string | undefined;

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "endpoint is required" },
        { status: 400 },
      );
    }

    // 3. Deactivate subscription
    await directDb
      .update(pushSubscriptions)
      .set({ active: "false", updatedAt: new Date() })
      .where(eq(pushSubscriptions.endpoint, endpoint));

    return NextResponse.json({ success: true, status: "unsubscribed" });
  } catch (error: unknown) {
    console.error("[PushSubscribe] DELETE error:", (error as Error).message);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET — Retorna la VAPID public key para que el frontend la use al suscribirse.
 *        También retorna el estado de suscripción del usuario autenticado.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const publicKey = getVapidPublicKey();

    // Buscar suscripciones activas del usuario autenticado
    let userSubscriptions: Array<{ endpoint: string; createdAt: string }> = [];
    if (user) {
      const subs = await directDb
        .select({
          endpoint: pushSubscriptions.endpoint,
          createdAt: pushSubscriptions.createdAt,
        })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.userId, user.id),
            eq(pushSubscriptions.active, "true"),
          ),
        )
        .orderBy(pushSubscriptions.createdAt);

      userSubscriptions = subs.map((s) => ({
        endpoint: s.endpoint.slice(0, 40) + "...", // truncate for display
        createdAt: s.createdAt?.toISOString() ?? "",
      }));
    }

    return NextResponse.json({
      success: true,
      publicKey,
      subscriptions: userSubscriptions,
      supported: !!publicKey,
    });
  } catch (error: unknown) {
    console.error("[PushSubscribe] GET error:", (error as Error).message);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
