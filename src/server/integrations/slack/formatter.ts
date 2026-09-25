import type { SlackAlert } from "./types";

export interface SlackWebhookPayload {
  text: string;
}

export function formatSlackAlert(alert: SlackAlert): SlackWebhookPayload {
  const severity = alert.severity.toUpperCase();
  return { text: `*[${severity}] ${alert.type}*\n${alert.message}` };
}
