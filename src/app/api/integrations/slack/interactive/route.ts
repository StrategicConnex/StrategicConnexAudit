import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";
import { formatError } from "@/server/integrations/commands/commands";
import { parseAllowedProjectIds, runScAuditCommand } from "@/server/integrations/commands/executor";
import { verifySlackRequest } from "@/server/integrations/slack/verify";

export const dynamic = "force-dynamic";

export const ACK_ACTION_ID = "scaudit_ack";

interface SlackInteractionPayload {
  type?: string;
  user?: { username?: string; name?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
}

/**
 * POST /api/integrations/slack/interactive — botones del bot.
 *
 * Reutiliza el ejecutor de comandos: el botón "Acusar recibo" de un mensaje
 * de `status` es el mismo camino que `ack <findingId>`, así que no hay dos
 * implementaciones del ACK que puedan divergir.
 *
 * `replace_original: false`: no se reescribe el mensaje original con la
 * respuesta (el ACK puede aplicarse una sola vez y el original sigue siendo
 * válido como registro de lo que se mostró).
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
    logger.warn("[slack] interacción rechazada", { reason: verification.reason });
    return NextResponse.json({ error: "Firma de Slack inválida" }, { status: 401 });
  }

  const payloadRaw = new URLSearchParams(rawBody).get("payload");
  if (!payloadRaw) {
    return NextResponse.json({ error: "Falta el payload" }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (!action || action.action_id !== ACK_ACTION_ID || !action.value) {
    return NextResponse.json({
      replace_original: false,
      text: formatError("Acción no reconocida.").text,
    });
  }

  const actor = payload.user?.username ?? payload.user?.name ?? "usuario desconocido";
  const response = await runScAuditCommand(
    { name: "ack", args: [action.value], raw: `ack ${action.value}` },
    {
      allowedProjectIds: parseAllowedProjectIds(process.env.SLACK_ALLOWED_PROJECT_IDS),
      source: `Slack (${actor})`,
    },
  );

  return NextResponse.json({ replace_original: false, text: response.text });
}

export const POST = withRequestContext(rawPost);
