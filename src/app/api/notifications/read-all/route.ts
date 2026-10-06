import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { markAllNotificationsRead } from "@/server/notifications/emit";
import { withErrorHandler } from "@/server/lib/error-handler";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read-all — marca toda la bandeja como leída. */
const rawPostHandler = withErrorHandler(async (_req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const updated = await markAllNotificationsRead(user.id);
  return NextResponse.json({ success: true, updated });
});

export const POST = withRequestContext(rawPostHandler);
