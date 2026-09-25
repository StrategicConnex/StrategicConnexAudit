import { ok, err, type Result } from "@/shared/lib/result";

import { formatTeamsAlert } from "./formatter";
import type { TeamsAlert } from "./types";

export async function sendTeamsAlert(
  webhookUrl: string,
  alert: TeamsAlert
): Promise<Result<void>> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formatTeamsAlert(alert)),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return err(new Error(`Teams webhook error: ${response.status}`));
    }
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
