import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUserOrThrow } from "@/shared/lib/auth";
import { withRLS } from "@/shared/db/rls";
import {
  intelligenceFindings,
  intelligenceAssets,
  intelligenceToolRuns,
  auditLogs,
} from "@/shared/db/schemas";
import { withErrorHandler } from "@/server/lib/error-handler";
import { ValidationError } from "@/server/lib/app-error";

export const dynamic = "force-dynamic";

type ExportFormat = "csv" | "json";

/**
 * GET /api/export?projectId=xxx&format=csv|json&resource=findings|assets|toolruns|auditlogs
 *
 * Bulk export of project data. Returns the data in CSV or JSON format.
 */
export const GET = withErrorHandler(async (req: NextRequest) => {
  const user = await getCurrentUserOrThrow();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const format = (searchParams.get("format") ?? "json") as ExportFormat;
  const resource = searchParams.get("resource") ?? "findings";

  if (!projectId) {
    throw new ValidationError("Falta projectId");
  }

  if (!["csv", "json"].includes(format)) {
    throw new ValidationError("Formato inválido. Usa 'csv' o 'json'");
  }

  if (!["findings", "assets", "toolruns", "auditlogs"].includes(resource)) {
    throw new ValidationError("Recurso inválido. Usa 'findings', 'assets', 'toolruns' o 'auditlogs'");
  }

  const result = await withRLS(user.id, async (tx) => {
    switch (resource) {
      case "findings": {
        const rows = await tx.query.intelligenceFindings.findMany({
          where: eq(intelligenceFindings.projectId, projectId),
        });
        return rows.map((r) => ({
          id: r.id,
          investigationId: r.investigationId,
          severity: r.severity,
          confidence: r.confidence,
          title: r.title,
          description: r.description,
          recommendation: r.recommendation,
          affectedAsset: r.affectedAsset,
          createdAt: r.createdAt?.toISOString(),
        }));
      }
      case "assets": {
        const rows = await tx.query.intelligenceAssets.findMany({
          where: eq(intelligenceAssets.projectId, projectId),
        });
        return rows.map((r) => ({
          id: r.id,
          assetType: r.assetType,
          value: r.value,
          ip: r.ip,
          firstSeenAt: r.firstSeenAt?.toISOString(),
          lastSeenAt: r.lastSeenAt?.toISOString(),
        }));
      }
      case "toolruns": {
        const rows = await tx.query.intelligenceToolRuns.findMany({
          where: eq(intelligenceToolRuns.projectId, projectId),
        });
        return rows.map((r) => ({
          id: r.id,
          toolId: r.toolId,
          category: r.category,
          status: r.status,
          durationMs: r.durationMs,
          costUnits: r.costUnits,
          startedAt: r.startedAt?.toISOString(),
          completedAt: r.completedAt?.toISOString(),
        }));
      }
      case "auditlogs": {
        const rows = await tx.query.auditLogs.findMany({
          where: eq(auditLogs.projectId, projectId),
        });
        return rows.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          userId: r.userId,
          ipAddress: r.ipAddress,
          createdAt: r.createdAt?.toISOString(),
        }));
      }
      default:
        return [];
    }
  });

  if (format === "json") {
    return NextResponse.json({
      success: true,
      resource,
      projectId,
      count: result.length,
      data: result,
    });
  }

  // CSV format
  if (result.length === 0) {
    return new NextResponse("No data", { status: 200, headers: { "Content-Type": "text/csv" } });
  }

  const headers = Object.keys(result[0]!);
  const csvRows = [
    headers.join(","),
    ...result.map((row) =>
      headers
        .map((h) => {
          const val = row[h as keyof typeof row];
          const str = val === null || val === undefined ? "" : String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(",")
    ),
  ];

  return new NextResponse(csvRows.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${resource}-${projectId}.csv"`,
    },
  });
});
