import "server-only";
import { and, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import { withRLS } from "@/shared/db/rls";
import { intelligenceFindings, findingActivity } from "@/shared/db/schemas/intelligence";
import type { FindingSeverity } from "@/shared/db/schemas/intelligence";

/**
 * workflow.ts — Ciclo de vida del hallazgo (Tanda 2 / B1).
 *
 * Un hallazgo deja de ser un hecho inmutable y pasa a ser trabajo con dueño,
 * estado y reloj. La máquina de estados es PURA (`FINDING_TRANSITIONS`): se
 * puede probar sin base de datos y es la única fuente de verdad de qué
 * movimientos son legales. El SQL solo acota el dominio con un CHECK; el
 * servidor decide las transiciones.
 *
 * Regla dura: un hallazgo CERRADO no vuelve a 'open'. Un escaneo posterior que
 * vuelve a detectar lo mismo no debe reabrir un ticket ya triado — eso lo
 * decide una persona, no el escáner. Por eso los estados terminales no tienen
 * salidas.
 */

export const FINDING_STATUSES = [
  "open",
  "acknowledged",
  "in_progress",
  "resolved",
  "false_positive",
  "accepted_risk",
] as const;

export type FindingStatus = (typeof FINDING_STATUSES)[number];

/** Estados terminales: cerrado el hallazgo, no hay vuelta atrás automática. */
export const TERMINAL_STATUSES: readonly FindingStatus[] = [
  "resolved",
  "false_positive",
  "accepted_risk",
];

/**
 * Transiciones legales. `open` solo puede acusarse (el analista confirma que lo
 * ha visto); a partir de ahí puede trabajarse, aparcarse o cerrarse. Los
 * estados terminales no salen.
 */
export const FINDING_TRANSITIONS: Record<FindingStatus, readonly FindingStatus[]> = {
  open: ["acknowledged"],
  acknowledged: ["open", "in_progress"],
  in_progress: ["acknowledged", "resolved", "false_positive", "accepted_risk"],
  resolved: [],
  false_positive: [],
  accepted_risk: [],
};

export function canTransition(from: FindingStatus, to: FindingStatus): boolean {
  return FINDING_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * SLA por defecto cuando el hallazgo no trae uno propio. Cuanto más grave,
 * menos margen: un crítico no puede esperar una semana.
 */
export const DEFAULT_SLA_HOURS: Record<FindingSeverity, number> = {
  critical: 24,
  high: 72,
  medium: 168, // 7 días
  low: 336, // 14 días
  info: 720, // 30 días
};

export function resolveSlaHours(severity: FindingSeverity, override: number | null): number {
  return override ?? DEFAULT_SLA_HOURS[severity];
}

export function computeDueAt(now: Date, slaHours: number): Date {
  return new Date(now.getTime() + slaHours * 60 * 60 * 1000);
}

/** ¿El vencimiento ya pasó? Sin due_at no hay SLA que incumplir. */
export function isOverdue(dueAt: Date | null, now: Date = new Date()): boolean {
  return dueAt != null && dueAt.getTime() < now.getTime();
}

export type TransitionResult =
  | { ok: true; status: FindingStatus; dueAt: string | null }
  | { ok: false; reason: "not_found" | "invalid_transition"; message: string };

/**
 * Aplica una transición y deja constancia en `finding_activity`.
 *
 * Escritura con directDb (role de servicio) porque `intelligence_findings` no
 * concede UPDATE a `authenticated`: la autorización se comprueba en la ruta
 * (requireProjectPermission) ANTES de llamar, igual que hace remediation. La
 * lectura del tablero sí pasa por withRLS (defensa en profundidad).
 */
export async function transitionFinding(input: {
  findingId: string;
  toStatus: FindingStatus;
  actorId: string | null;
  note?: string | null;
}): Promise<TransitionResult> {
  const finding = await directDb.query.intelligenceFindings.findFirst({
    where: eq(intelligenceFindings.id, input.findingId),
    columns: {
      id: true,
      status: true,
      severity: true,
      slaHours: true,
      acknowledgedAt: true,
    },
  });
  if (!finding) {
    return { ok: false, reason: "not_found", message: "Hallazgo no encontrado" };
  }

  const from = finding.status as FindingStatus;
  if (!canTransition(from, input.toStatus)) {
    return {
      ok: false,
      reason: "invalid_transition",
      message: `Transición no permitida: ${from} → ${input.toStatus}`,
    };
  }

  const now = new Date();
  const patch: {
    status: FindingStatus;
    slaHours?: number;
    acknowledgedAt?: Date;
    dueAt?: Date;
    resolvedAt?: Date;
  } = { status: input.toStatus };

  if (input.toStatus === "acknowledged") {
    // El reloj arranca al acusar, no al detectar (ver cabecera de la migración).
    const hours = resolveSlaHours(finding.severity, finding.slaHours);
    patch.slaHours = hours;
    patch.acknowledgedAt = finding.acknowledgedAt ?? now;
    patch.dueAt = computeDueAt(now, hours);
  }
  if (TERMINAL_STATUSES.includes(input.toStatus)) {
    patch.resolvedAt = now;
  }

  await directDb.transaction(async (tx) => {
    await tx
      .update(intelligenceFindings)
      .set(patch)
      .where(eq(intelligenceFindings.id, input.findingId));
    await tx.insert(findingActivity).values({
      findingId: input.findingId,
      fromStatus: from,
      toStatus: input.toStatus,
      actorId: input.actorId,
      note: input.note ?? null,
    });
  });

  return { ok: true, status: input.toStatus, dueAt: patch.dueAt?.toISOString() ?? null };
}

/**
 * Oculta un hallazgo por ruido conocido hasta una fecha (B6). No es un cierre:
 * el hallazgo sigue ahí y el barrido de SLA no lo escala mientras esté
 * suprimido. Es una decisión explícita del analista, con motivo obligatorio.
 */
export async function suppressFinding(input: {
  findingId: string;
  actorId: string | null;
  reason: string;
  hours: number;
}): Promise<{ ok: boolean; suppressedUntil: string | null }> {
  const now = new Date();
  const until = computeDueAt(now, input.hours);
  const updated = await directDb
    .update(intelligenceFindings)
    .set({ suppressedUntil: until, suppressedReason: input.reason })
    .where(eq(intelligenceFindings.id, input.findingId))
    .returning({ id: intelligenceFindings.id });
  if (updated.length === 0) return { ok: false, suppressedUntil: null };
  return { ok: true, suppressedUntil: until.toISOString() };
}

export interface BoardFinding {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: FindingStatus;
  assigneeId: string | null;
  slaHours: number | null;
  dueAt: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  suppressedUntil: string | null;
  suppressedReason: string | null;
  affectedAsset: string | null;
  aiTriage: Record<string, unknown> | null;
  createdAt: string | null;
  overdue: boolean;
}

function toBoardFinding(row: {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  status: string;
  assigneeId: string | null;
  slaHours: number | null;
  dueAt: Date | null;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  suppressedUntil: Date | null;
  suppressedReason: string | null;
  affectedAsset: string | null;
  aiTriage: Record<string, unknown> | null;
  createdAt: Date | null;
}): BoardFinding {
  const now = new Date();
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status as FindingStatus,
    assigneeId: row.assigneeId,
    slaHours: row.slaHours,
    dueAt: row.dueAt?.toISOString() ?? null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    suppressedUntil: row.suppressedUntil?.toISOString() ?? null,
    suppressedReason: row.suppressedReason,
    affectedAsset: row.affectedAsset,
    aiTriage: row.aiTriage,
    createdAt: row.createdAt?.toISOString() ?? null,
    overdue:
      !TERMINAL_STATUSES.includes(row.status as FindingStatus) &&
      isOverdue(row.dueAt, now),
  };
}

/** Límite defensivo del tablero: un proyecto con miles de hallazgos no debe volcar la página. */
export const BOARD_LIMIT = 200;

/**
 * Tablero del proyecto. Lee vía `withRLS` para que un bug de permisos no se
 * convierta en fuga entre tenants: aunque la ruta ya comprobó el acceso, la
 * política de Postgres vuelve a filtrar por proyecto.
 */
export async function listFindingsForBoard(input: {
  userId: string;
  projectId: string;
  statuses?: readonly FindingStatus[];
}): Promise<BoardFinding[]> {
  const statusFilter = input.statuses?.length ? input.statuses : FINDING_STATUSES;
  const rows = await withRLS(input.userId, (tx) =>
    tx
      .select({
        id: intelligenceFindings.id,
        projectId: intelligenceFindings.projectId,
        title: intelligenceFindings.title,
        description: intelligenceFindings.description,
        severity: intelligenceFindings.severity,
        status: intelligenceFindings.status,
        assigneeId: intelligenceFindings.assigneeId,
        slaHours: intelligenceFindings.slaHours,
        dueAt: intelligenceFindings.dueAt,
        acknowledgedAt: intelligenceFindings.acknowledgedAt,
        resolvedAt: intelligenceFindings.resolvedAt,
        suppressedUntil: intelligenceFindings.suppressedUntil,
        suppressedReason: intelligenceFindings.suppressedReason,
        affectedAsset: intelligenceFindings.affectedAsset,
        aiTriage: intelligenceFindings.aiTriage,
        createdAt: intelligenceFindings.createdAt,
      })
      .from(intelligenceFindings)
      .where(
        and(
          eq(intelligenceFindings.projectId, input.projectId),
          inArray(intelligenceFindings.status, [...statusFilter]),
        ),
      )
      .orderBy(desc(intelligenceFindings.createdAt))
      .limit(BOARD_LIMIT),
  );
  return rows.map(toBoardFinding);
}

/** Scope mínimo de un hallazgo: id, proyecto y estado actual. */
export async function getFindingScope(findingId: string) {
  return (
    (await directDb.query.intelligenceFindings.findFirst({
      where: eq(intelligenceFindings.id, findingId),
      columns: { id: true, projectId: true, status: true },
    })) ?? null
  );
}

/** Historial de un hallazgo, del más reciente al más antiguo. */
export async function listFindingActivity(findingId: string) {
  return directDb.query.findingActivity.findMany({
    where: eq(findingActivity.findingId, findingId),
    orderBy: [desc(findingActivity.createdAt)],
    limit: 100,
  });
}

/** Hallazgos vencidos y aún abiertos (no suprimidos). Alimenta el escalado (B6). */
export async function listOverdueFindings(limit = 100) {
  return directDb.query.intelligenceFindings.findMany({
    where: and(
      isNotNull(intelligenceFindings.dueAt),
      lt(intelligenceFindings.dueAt, new Date()),
      inArray(intelligenceFindings.status, ["open", "acknowledged", "in_progress"]),
      sql`(${intelligenceFindings.suppressedUntil} IS NULL OR ${intelligenceFindings.suppressedUntil} < now())`,
    ),
    orderBy: [intelligenceFindings.dueAt],
    limit,
  });
}
