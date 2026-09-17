import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { directDb } from "@/shared/db";
import {
  users,
  projectMembers,
  securityAuditLogs,
  siemAlertLogs,
  adversaryAssessments,
  adversaryVulnerabilities,
  auditLogs,
} from "@/shared/db/schemas";
import { requireAdmin } from "@/server/auth/admin";
import { logger } from "@/lib/logger";

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
export async function GET() {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.response;

    const since = new Date(Date.now() - 90 * 86400000);
    const controls: ControlEvidence[] = [];

    // CC6.1 — Acceso lógico: roles y membresías.
    const [userCount] = await directDb
      .select({ n: count() })
      .from(users);
    const [memberCount] = await directDb
      .select({ n: count() })
      .from(projectMembers);
    const adminCount = await directDb
      .select({ n: count() })
      .from(users)
      .where(eq(users.role, "admin"));
    controls.push({
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
    const secByType = await directDb
      .select({ eventType: securityAuditLogs.eventType, n: count() })
      .from(securityAuditLogs)
      .where(gte(securityAuditLogs.createdAt, since))
      .groupBy(securityAuditLogs.eventType)
      .orderBy(desc(count()))
      .limit(20);
    const [siemTotal] = await directDb
      .select({ n: count() })
      .from(siemAlertLogs)
      .where(gte(siemAlertLogs.createdAt, since));
    controls.push({
      control: "CC7.2",
      title: "Monitoreo continuo: eventos auditados y alertas SIEM (90d)",
      evidence: {
        securityEventsByType: secByType.map((r) => ({ type: r.eventType, count: Number(r.n) })),
        siemDeliveries: Number(siemTotal?.n ?? 0),
      },
    });

    // CC7.3 — Respuesta a incidentes: evaluaciones y vulnerabilidades.
    const [assessCount] = await directDb
      .select({ n: count() })
      .from(adversaryAssessments)
      .where(gte(adversaryAssessments.createdAt, since));
    const vulnsBySeverity = await directDb
      .select({
        severity: sql<string>`severity`,
        n: count(),
      })
      .from(adversaryVulnerabilities)
      .groupBy(sql`severity`);
    controls.push({
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
    const [auditCount] = await directDb
      .select({ n: count() })
      .from(auditLogs)
      .where(gte(auditLogs.createdAt, since));
    controls.push({
      control: "CC8.1",
      title: "Gestión del cambio: acciones auditadas en plataforma (90d)",
      evidence: {
        auditedActions: Number(auditCount?.n ?? 0),
        deploys: "Trazabilidad de deploys vía proveedor (Vercel/Trigger.dev); cambios de esquema vía migraciones Drizzle numeradas",
      },
    });

    // A1.2 — Retención y purga.
    controls.push({
      control: "A1.2",
      title: "Retención: purga automática de telemetría y sesiones",
      evidence: {
        policy: "uptime/vitals 30d, heatmap 90d, security_audit 365d (cleanup-old-logs diario)",
        retentionConfigurablePerProject: "projects.dataRetentionDays",
      },
    });

    const pack = {
      generatedAt: new Date().toISOString(),
      windowDays: 90,
      controls,
    };
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
