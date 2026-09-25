import { ok, err, type Result } from "@/shared/lib/result";

import { formatSlackAlert } from "./formatter";
import type { SlackAlert } from "./types";

export async function sendSlackAlert(
  webhookUrl: string,
  alert: SlackAlert
): Promise<Result<void>> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatSlackAlert(alert)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return err(new Error(`Slack webhook error: ${response.status}`));
    }
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
