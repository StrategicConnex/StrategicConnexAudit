import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { withRLS } from "@/shared/db/rls";
import type { DbExecutor } from "@/shared/db/executor";
import {
  users,
  projectMembers,
  securityAuditLogs,
  siemAlertLogs,
  adversaryAssessments,
  adversaryVulnerabilities,
  auditLogs,
} from "@/shared/db/schemas";
import { createClient } from "@/shared/lib/supabase/server";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

interface ControlEvidence {
  control: string;
  title: string;
  evidence: Record<string, unknown>;
}

/**
 * GET /api/compliance/soc2-pack — Paquete de evidencias SOC 2 (C-3).
 *
 * Solo admin de plataforma. Cada control cita consultas REALES con conteos
 * de los últimos 90 días; el paquete incluye su hash SHA-256 para cadena
 * de custodia. Sin PII: agregados y metadatos, nunca contenidos crudos.
 */
async function rawGet() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 },
      );
    }

    // Verificar rol admin de plataforma dentro de withRLS para coherencia
    const { ok, response } = await withRLS(user.id, async (tx: DbExecutor) => {
      const [row] = await tx
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      if (row?.role !== "admin") {
        return {
          ok: false,
          response: NextResponse.json(
            { success: false, error: "Prohibido: se requiere rol admin" },
            { status: 403 },
          ),
        };
      }
      return { ok: true };
    });

    if (!ok) return response;

    const since = new Date(Date.now() - 90 * 86400000);

    const { pack } = await withRLS(user.id, async (tx: DbExecutor) => {
      const controlsInner: ControlEvidence[] = [];

      // CC6.1 — Acceso lógico: roles y membresías.
      const [userCount] = await tx
        .select({ n: count() })
        .from(users);
      const [memberCount] = await tx
        .select({ n: count() })
        .from(projectMembers);
      const adminCount = await tx
        .select({ n: count() })
        .from(users)
        .where(eq(users.role, "admin"));
      controlsInner.push({
        control: "CC6.1",
        title: "Acceso lógico: usuarios, roles y membresías por proyecto",
        evidence: {
          users: Number(userCount?.n ?? 0),
          platformAdmins: Number(adminCount[0]?.n ?? 0),
          projectMemberships: Number(memberCount?.n ?? 0),
          enforcement: "RLS member_or_owner + assertProjectAccess + RBAC por roles",
        },
      });

      // CC7.2 — Monitoreo continuo: eventos de seguridad y alertas SIEM.
      const secByType = await tx
        .select({ eventType: securityAuditLogs.eventType, n: count() })
        .from(securityAuditLogs)
        .where(gte(securityAuditLogs.createdAt, since))
        .groupBy(securityAuditLogs.eventType)
        .orderBy(desc(count()))
        .limit(20);
      const [siemTotal] = await tx
        .select({ n: count() })
        .from(siemAlertLogs)
        .where(gte(siemAlertLogs.createdAt, since));
      controlsInner.push({
        control: "CC7.2",
        title: "Monitoreo continuo: eventos auditados y alertas SIEM (90d)",
        evidence: {
          securityEventsByType: secByType.map((r) => ({ type: r.eventType, count: Number(r.n) })),
          siemDeliveries: Number(siemTotal?.n ?? 0),
        },
      });

      // CC7.3 — Respuesta a incidentes: evaluaciones y vulnerabilidades.
      const [assessCount] = await tx
        .select({ n: count() })
        .from(adversaryAssessments)
        .where(gte(adversaryAssessments.createdAt, since));
      const vulnsBySeverity = await tx
        .select({
          severity: sql<string>`severity`,
          n: count(),
        })
        .from(adversaryVulnerabilities)
        .groupBy(sql`severity`);
      controlsInner.push({
        control: "CC7.3",
        title: "Respuesta a incidentes: evaluaciones adversarias y hallazgos (90d)",
        evidence: {
          assessments: Number(assessCount?.n ?? 0),
          vulnerabilitiesBySeverity: vulnsBySeverity.map((r) => ({
            severity: r.severity,
            count: Number(r.n),
          })),
        },
      });

      // CC8.1 — Gestión del cambio: actividad de auditoría de la plataforma.
      const [auditCount] = await tx
        .select({ n: count() })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, since));
      controlsInner.push({
        control: "CC8.1",
        title: "Gestión del cambio: acciones auditadas en plataforma (90d)",
        evidence: {
          auditedActions: Number(auditCount?.n ?? 0),
          deploys: "Trazabilidad de deploys vía proveedor (Vercel/Trigger.dev); cambios de esquema vía migraciones Drizzle numeradas",
        },
      });

      // A1.2 — Retención y purga.
      controlsInner.push({
        control: "A1.2",
        title: "Retención: purga automática de telemetría y sesiones",
        evidence: {
          policy: "uptime/vitals 30d, heatmap 90d, security_audit 365d (cleanup-old-logs diario)",
          retentionConfigurablePerProject: "projects.dataRetentionDays",
        },
      });

      const packInner = {
        generatedAt: new Date().toISOString(),
        windowDays: 90,
        controls: controlsInner,
      };
      return { pack: packInner };
    });

    const hash = createHash("sha256").update(JSON.stringify(pack)).digest("hex");

    return NextResponse.json(
      { success: true, sha256: hash, pack },
      {
        headers: {
          "Content-Disposition": `attachment; filename="soc2-evidence-pack.json"`,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    logger.error("GET soc2-pack failure:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export const GET = withRequestContext(rawGet);
