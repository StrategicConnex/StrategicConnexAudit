import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { listNotifications, countUnread, INBOX_LIMIT } from "@/server/notifications/emit";
import { withErrorHandler } from "@/server/lib/error-handler";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?unread=1&limit=20
 *
 * Bandeja del usuario autenticado. No lleva projectId: las notificaciones son
 * personales (RLS por user_id), no de proyecto.
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const params = new URL(req.url).searchParams;

  const unreadOnly = params.get("unread") === "1" || params.get("unread") === "true";
  const parsedLimit = Number.parseInt(params.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, INBOX_LIMIT)
      : undefined;

  const [items, unread] = await Promise.all([
    listNotifications(user.id, { unreadOnly, limit }),
    countUnread(user.id),
  ]);

  return NextResponse.json({ success: true, notifications: items, unread });
});

export const GET = withRequestContext(rawGetHandler);
