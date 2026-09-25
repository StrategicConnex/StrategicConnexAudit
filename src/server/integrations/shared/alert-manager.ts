import { logger } from "@/lib/logger";
import { err, type Result } from "@/shared/lib/result";
import { sendSlackAlert } from "@/server/integrations/slack/client";
import { sendTeamsAlert } from "@/server/integrations/teams/client";

export type AlertSeverity = "critical" | "warning" | "info";

export interface AlertPayload {
  type: string;
  message: string;
  severity: AlertSeverity;
}

export type AlertChannel = "slack" | "teams";

export interface AlertChannelDelivery {
  channel: AlertChannel;
  result: Result<void>;
}

export interface AlertSummary {
  ok: boolean;
  attempted: number;
  delivered: number;
  failed: number;
  deliveries: AlertChannelDelivery[];
}

interface AlertChannelConfig {
  channel: AlertChannel;
  envVar: string;
  send: (webhookUrl: string, alert: AlertPayload) => Promise<Result<void>>;
}

const ALERT_CHANNELS: AlertChannelConfig[] = [
  { channel: "slack", envVar: "SLACK_WEBHOOK_URL", send: sendSlackAlert },
  { channel: "teams", envVar: "TEAMS_WEBHOOK_URL", send: sendTeamsAlert },
];

async function deliverToChannel(
  config: AlertChannelConfig,
  webhookUrl: string,
  alert: AlertPayload
): Promise<Result<void>> {
  try {
    return await config.send(webhookUrl, alert);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export async function manageAlert(alert: AlertPayload): Promise<AlertSummary> {
  const deliveries: AlertChannelDelivery[] = [];

  for (const config of ALERT_CHANNELS) {
    const webhookUrl = process.env[config.envVar]?.trim();
    if (!webhookUrl) continue;
    deliveries.push({
      channel: config.channel,
      result: await deliverToChannel(config, webhookUrl, alert),
    });
  }

  const attempted = deliveries.length;
  const delivered = deliveries.filter((delivery) => delivery.result.ok).length;
  const failed = attempted - delivered;
  const summary: AlertSummary = {
    ok: failed === 0,
    attempted,
    delivered,
    failed,
    deliveries,
  };

  if (attempted === 0) {
    logger.info("[AlertManager] Sin webhooks configurados: alerta omitida.", {
      type: alert.type,
      severity: alert.severity,
    });
  } else if (summary.ok) {
    logger.info("[AlertManager] Alerta entregada.", {
      type: alert.type,
      severity: alert.severity,
      delivered,
    });
  } else {
    logger.warn("[AlertManager] Alerta con fallos de entrega.", {
      type: alert.type,
      severity: alert.severity,
      attempted,
      delivered,
      failed,
      errors: deliveries.flatMap((delivery) =>
        delivery.result.ok
          ? []
          : [{ channel: delivery.channel, error: delivery.result.error.message }]
      ),
    });
  }

  return summary;
}
