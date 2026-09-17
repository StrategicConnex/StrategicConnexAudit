import { and, desc, eq } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { remediationActions, type RemediationConnector } from "@/shared/db/schemas/remediation";
import { encryptField } from "@/server/lib/field-crypto";
import { decryptConfig } from "./connectors";
import { executeConnector } from "./connectors";
import { logger } from "@/lib/logger";

export type { RemediationConnector };

/**
 * remediation-service.ts — Máquina de estados propose → approve → execute (C-2).
 *
 * Las rutas verifican permiso ANTES de llamar (owner/admin/editor según caso);
 * el servicio persiste y ejecuta. Los secretos se cifran al guardar.
 */

export async function listActions(projectId: string) {
  return directDb.query.remediationActions.findMany({
    where: eq(remediationActions.projectId, projectId),
    orderBy: [desc(remediationActions.createdAt)],
    limit: 50,
  });
}

export async function proposeAction(input: {
  projectId: string;
  title: string;
  connector: RemediationConnector;
  config: Record<string, string>;
  steps?: string[];
  assessmentId?: string;
  vulnerabilityTitle?: string;
  createdBy?: string;
}) {
  const hasSecrets = Object.keys(input.config).length > 0;
  const [row] = await directDb
    .insert(remediationActions)
    .values({
      projectId: input.projectId,
      title: input.title.slice(0, 200),
      connector: input.connector,
      configEncrypted: hasSecrets ? encryptField(JSON.stringify(input.config)) : null,
      steps: input.steps ?? [],
      status: "proposed",
      assessmentId: input.assessmentId,
      vulnerabilityTitle: input.vulnerabilityTitle,
      createdBy: input.createdBy,
    })
    .returning({ id: remediationActions.id });
  if (!row) throw new Error("No se pudo crear la acción");
  return row.id as string;
}

export async function approveAction(actionId: string): Promise<void> {
  const updated = await directDb
    .update(remediationActions)
    .set({ status: "approved", updatedAt: new Date() })
    .where(and(eq(remediationActions.id, actionId), eq(remediationActions.status, "proposed")))
    .returning({ id: remediationActions.id });
  if (updated.length === 0) {
    throw new Error("La acción no está en estado proposed");
  }
}

export async function executeAction(actionId: string): Promise<Record<string, unknown>> {
  const [action] = await directDb
    .select()
    .from(remediationActions)
    .where(eq(remediationActions.id, actionId))
    .limit(1);
  if (!action) throw new Error("Acción no encontrada");
  if (action.status !== "approved") {
    throw new Error(`Solo se puede ejecutar en estado approved (actual: ${action.status})`);
  }

  await directDb
    .update(remediationActions)
    .set({ status: "executing", updatedAt: new Date() })
    .where(eq(remediationActions.id, actionId));

  try {
    const config = decryptConfig(action.configEncrypted);
    const result = await executeConnector(action.connector, config, {
      title: action.title,
      steps: action.steps ?? [],
    });
    await directDb
      .update(remediationActions)
      .set({ status: "verified", result: result.evidence, updatedAt: new Date() })
      .where(eq(remediationActions.id, actionId));
    return { ok: true, ...result.evidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("remediation execute falló", { error: message });
    await directDb
      .update(remediationActions)
      .set({ status: "failed", result: { error: message.slice(0, 500) }, updatedAt: new Date() })
      .where(eq(remediationActions.id, actionId));
    throw new Error(message);
  }
}
