/**
 * chat-telemetry.ts — eventos de calidad del chat hacia `app_logs`.
 *
 * Contrato de privacidad: el contexto solo lleva identificadores y conteos.
 * Nunca se registra el prompt, la respuesta del modelo ni el contenido de un
 * hallazgo. La consulta de lectura está en el runbook de Sprint 2 (C4):
 *
 *   SELECT count(*) FROM app_logs
 *   WHERE message = 'chat.citation.unverified'
 *     AND created_at > now() - interval '7 days';
 */

import { captureAppLog } from "./app-logs-sink";

export interface UnverifiedCitationEvent {
  correlationId: string;
  taskType: string;
  /** Nº de marcadores de cita que no correspondían a un hallazgo validado. */
  count: number;
}

export async function recordUnverifiedCitations(event: UnverifiedCitationEvent): Promise<void> {
  if (event.count <= 0) return;
  await captureAppLog({
    level: "warn",
    message: "chat.citation.unverified",
    source: "chat",
    context: {
      correlationId: event.correlationId,
      taskType: event.taskType,
      count: event.count,
    },
  });
}
