import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import {
  buildSlackBlocks,
  formatError,
  parseCommandText,
} from "@/server/integrations/commands/commands";
import { parseAllowedProjectIds, runScAuditCommand } from "@/server/integrations/commands/executor";
import { verifySlackRequest } from "@/server/integrations/slack/verify";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/slack/commands — slash command `/scaudit`.
 *
 * La firma se verifica sobre el cuerpo CRUDO antes de leer nada: sin ella
 * cualquiera podría POSTear comandos. Fail-closed: sin `SLACK_SIGNING_SECRET`
 * la ruta responde 503 en vez de aceptar requests sin verificar.
 *
 * Respuestas: siempre `ephemeral` — el bot no ensucia el canal con cada
 * consulta; el canal solo recibe lo que el analista decide publicar.
 */
async function rawPost(request: Request) {
  const rawBody = await request.text();

  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { error: "Slack no configurado: falta SLACK_SIGNING_SECRET" },
      { status: 503 }
    );
  }

  const verification = verifySlackRequest({
    body: rawBody,
    timestamp: request.headers.get("x-slack-request-timestamp"),
    signature: request.headers.get("x-slack-signature"),
    signingSecret,
  });

  if (!verification.ok) {
    logger.warn("[slack] comando rechazado", { reason: verification.reason });
    return NextResponse.json({ error: "Firma de Slack inválida" }, { status: 401 });
  }

  // Slack envía `application/x-www-form-urlencoded` (con ssl_check como caso especial).
  const form = new URLSearchParams(rawBody);

  const parsed = parseCommandText(form.get("text") ?? "");
  if (!parsed.ok) {
    return NextResponse.json({
      response_type: "ephemeral",
      text: formatError(parsed.error).text,
    });
  }

  const response = await runScAuditCommand(parsed.command, {
    allowedProjectIds: parseAllowedProjectIds(process.env.SLACK_ALLOWED_PROJECT_IDS),
    source: `Slack (${form.get("user_name") ?? "usuario desconocido"})`,
  });

  return NextResponse.json({
    response_type: "ephemeral",
    text: response.text,
    blocks: buildSlackBlocks(response),
  });
}

export const POST = withRequestContext(rawPost);
