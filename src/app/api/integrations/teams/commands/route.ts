import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import { verifyWebhookSignature } from "@/server/security/cicd-helper";
import { stripTeamsMentions } from "@/server/integrations/teams/parse";
import { formatError, parseCommandText } from "@/server/integrations/commands/commands";
import { parseAllowedProjectIds, runScAuditCommand } from "@/server/integrations/commands/executor";

export const dynamic = "force-dynamic";

interface TeamsActivity {
  type?: string;
  text?: string;
  from?: { name?: string; aadObjectId?: string };
}

/**
 * POST /api/integrations/teams/commands — bot bidireccional en Teams.
 *
 * Teams (outgoing webhook / Bot Framework) no firma con un esquema propio
 * sencillo: se exige el MISMO HMAC que el webhook de CI/CD
 * (`x-scaudit-signature` sobre el cuerpo crudo con `SCAUDIT_TEAMS_SECRET`).
 * Fail-closed: sin secreto configurado se rechaza siempre.
 */
async function rawPost(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-scaudit-signature") ?? "";

  const secret = process.env.SCAUDIT_TEAMS_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Teams no configurado: falta SCAUDIT_TEAMS_SECRET" },
      { status: 503 }
    );
  }

  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn("[teams] comando rechazado", { reason: "bad_signature" });
    return NextResponse.json({ error: "Firma inválida o no provista" }, { status: 401 });
  }

  let activity: TeamsActivity;
  try {
    activity = JSON.parse(rawBody || "{}") as TeamsActivity;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const text = stripTeamsMentions(activity.text ?? "");
  const parsed = parseCommandText(text);
  if (!parsed.ok) {
    return NextResponse.json({ type: "message", text: formatError(parsed.error).text });
  }

  const response = await runScAuditCommand(parsed.command, {
    allowedProjectIds: parseAllowedProjectIds(process.env.SLACK_ALLOWED_PROJECT_IDS),
    source: `Teams (${activity.from?.name ?? "usuario desconocido"})`,
  });

  return NextResponse.json({ type: "message", text: response.text });
}

export const POST = withRequestContext(rawPost);
