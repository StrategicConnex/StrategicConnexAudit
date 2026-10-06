import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { markNotificationRead } from "@/server/notifications/emit";
import { withErrorHandler } from "@/server/lib/error-handler";
import { NotFoundError } from "@/server/lib/app-error";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/** POST /api/notifications/[id]/read — marca una notificación como leída. */
const rawPostHandler = withErrorHandler(
  async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    const user = await getCurrentUserOrThrow();
    const { id } = await ctx.params;

    const ok = await markNotificationRead(user.id, id);
    if (!ok) {
      throw new NotFoundError("Notificación", id);
    }
    return NextResponse.json({ success: true });
  },
);

export const POST = withRequestContext(rawPostHandler);
