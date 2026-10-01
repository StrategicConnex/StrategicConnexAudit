import { NextRequest, NextResponse } from "next/server";
import { and, asc, count, eq, gt } from "drizzle-orm";
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
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

type ExportFormat = "csv" | "json";
type ExportResource = "findings" | "assets" | "toolruns" | "auditlogs";

/**
 * TD-13: paginación explícita por keyset. Cada transacción RLS lee a lo sumo
 * EXPORT_BATCH_SIZE filas (id ASC) y la respuesta se emite en streaming; el
 * recurso completo nunca se materializa en memoria. El count del JSON se
 * calcula con COUNT(*) previo al stream (mismo shape que la versión previa).
 */
export const EXPORT_BATCH_SIZE = 1000;

type ExportRow = Record<string, string | number | null | undefined>;

interface ExportBatch {
  rows: ExportRow[];
  cursor: string | null;
}

async function fetchExportBatch(
  userId: string,
  resource: ExportResource,
  projectId: string,
  afterId: string | null,
): Promise<ExportBatch> {
  return withRLS(userId, async (tx) => {
    switch (resource) {
      case "findings": {
        const where = afterId
          ? and(
              eq(intelligenceFindings.projectId, projectId),
              gt(intelligenceFindings.id, afterId),
            )
          : eq(intelligenceFindings.projectId, projectId);
        const rows = await tx.query.intelligenceFindings.findMany({
          where,
          orderBy: [asc(intelligenceFindings.id)],
          limit: EXPORT_BATCH_SIZE,
        });
        return {
          rows: rows.map((r) => ({
            id: r.id,
            investigationId: r.investigationId,
            severity: r.severity,
            confidence: r.confidence,
            title: r.title,
            description: r.description,
            recommendation: r.recommendation,
            affectedAsset: r.affectedAsset,
            createdAt: r.createdAt?.toISOString(),
          })),
          cursor: rows.length > 0 ? rows[rows.length - 1]!.id : null,
        };
      }
      case "assets": {
        const where = afterId
          ? and(eq(intelligenceAssets.projectId, projectId), gt(intelligenceAssets.id, afterId))
          : eq(intelligenceAssets.projectId, projectId);
        const rows = await tx.query.intelligenceAssets.findMany({
          where,
          orderBy: [asc(intelligenceAssets.id)],
          limit: EXPORT_BATCH_SIZE,
        });
        return {
          rows: rows.map((r) => ({
            id: r.id,
            assetType: r.assetType,
            value: r.value,
            ip: r.ip,
            firstSeenAt: r.firstSeenAt?.toISOString(),
            lastSeenAt: r.lastSeenAt?.toISOString(),
          })),
          cursor: rows.length > 0 ? rows[rows.length - 1]!.id : null,
        };
      }
      case "toolruns": {
        const where = afterId
          ? and(eq(intelligenceToolRuns.projectId, projectId), gt(intelligenceToolRuns.id, afterId))
          : eq(intelligenceToolRuns.projectId, projectId);
        const rows = await tx.query.intelligenceToolRuns.findMany({
          where,
          orderBy: [asc(intelligenceToolRuns.id)],
          limit: EXPORT_BATCH_SIZE,
        });
        return {
          rows: rows.map((r) => ({
            id: r.id,
            toolId: r.toolId,
            category: r.category,
            status: r.status,
            durationMs: r.durationMs,
            costUnits: r.costUnits,
            startedAt: r.startedAt?.toISOString(),
            completedAt: r.completedAt?.toISOString(),
          })),
          cursor: rows.length > 0 ? rows[rows.length - 1]!.id : null,
        };
      }
      case "auditlogs": {
        const where = afterId
          ? and(eq(auditLogs.projectId, projectId), gt(auditLogs.id, afterId))
          : eq(auditLogs.projectId, projectId);
        const rows = await tx.query.auditLogs.findMany({
          where,
          orderBy: [asc(auditLogs.id)],
          limit: EXPORT_BATCH_SIZE,
        });
        return {
          rows: rows.map((r) => ({
            id: r.id,
            action: r.action,
            entityType: r.entityType,
            entityId: r.entityId,
            userId: r.userId,
            ipAddress: r.ipAddress,
            createdAt: r.createdAt?.toISOString(),
          })),
          cursor: rows.length > 0 ? rows[rows.length - 1]!.id : null,
        };
      }
    }
  });
}

async function countExportRows(
  userId: string,
  resource: ExportResource,
  projectId: string,
): Promise<number> {
  return withRLS(userId, async (tx) => {
    switch (resource) {
      case "findings": {
        const rows = await tx
          .select({ n: count() })
          .from(intelligenceFindings)
          .where(eq(intelligenceFindings.projectId, projectId));
        return Number(rows[0]?.n ?? 0);
      }
      case "assets": {
        const rows = await tx
          .select({ n: count() })
          .from(intelligenceAssets)
          .where(eq(intelligenceAssets.projectId, projectId));
        return Number(rows[0]?.n ?? 0);
      }
      case "toolruns": {
        const rows = await tx
          .select({ n: count() })
          .from(intelligenceToolRuns)
          .where(eq(intelligenceToolRuns.projectId, projectId));
        return Number(rows[0]?.n ?? 0);
      }
      case "auditlogs": {
        const rows = await tx
          .select({ n: count() })
          .from(auditLogs)
          .where(eq(auditLogs.projectId, projectId));
        return Number(rows[0]?.n ?? 0);
      }
    }
  });
}

function toCsvValue(val: string | number | null | undefined): string {
  const str = val === null || val === undefined ? "" : String(val);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

/**
 * GET /api/export?projectId=xxx&format=csv|json&resource=findings|assets|toolruns|auditlogs
 *
 * Bulk export of project data. Returns the data in CSV or JSON format.
 * Responses are streamed in keyset-paginated batches (TD-13): the full
 * resource is never loaded into memory at once.
 */
const rawGetHandler = withErrorHandler(async (req: NextRequest) => {
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

  const exportResource = resource as ExportResource;
  const encoder = new TextEncoder();

  if (format === "json") {
    const total = await countExportRows(user.id, exportResource, projectId);
    const head =
      `{"success":true,"resource":${JSON.stringify(resource)},` +
      `"projectId":${JSON.stringify(projectId)},"count":${total},"data":[`;
    let cursor: string | null = null;
    let first = true;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(head));
      },
      async pull(controller) {
        try {
          const batch = await fetchExportBatch(user.id, exportResource, projectId, cursor);
          if (batch.rows.length === 0) {
            controller.enqueue(encoder.encode("]}"));
            controller.close();
            return;
          }
          cursor = batch.cursor;
          const payload = batch.rows.map((row) => JSON.stringify(row)).join(",");
          controller.enqueue(encoder.encode(first ? payload : `,${payload}`));
          first = false;
          if (batch.rows.length < EXPORT_BATCH_SIZE) {
            controller.enqueue(encoder.encode("]}"));
            controller.close();
          }
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const firstBatch = await fetchExportBatch(user.id, exportResource, projectId, null);
  if (firstBatch.rows.length === 0) {
    return new NextResponse("No data", { status: 200, headers: { "Content-Type": "text/csv" } });
  }

  const headers = Object.keys(firstBatch.rows[0]!);
  const toCsvLine = (row: ExportRow) => headers.map((h) => toCsvValue(row[h])).join(",");
  let cursor = firstBatch.cursor;
  let pending = firstBatch.rows.length >= EXPORT_BATCH_SIZE;

  const csvStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const lines = [headers.join(","), ...firstBatch.rows.map(toCsvLine)];
      controller.enqueue(encoder.encode(`${lines.join("\n")}\n`));
    },
    async pull(controller) {
      try {
        if (!pending) {
          controller.close();
          return;
        }
        const batch = await fetchExportBatch(user.id, exportResource, projectId, cursor);
        if (batch.rows.length === 0) {
          controller.close();
          return;
        }
        cursor = batch.cursor;
        if (batch.rows.length < EXPORT_BATCH_SIZE) pending = false;
        controller.enqueue(encoder.encode(`${batch.rows.map(toCsvLine).join("\n")}\n`));
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new NextResponse(csvStream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${resource}-${projectId}.csv"`,
    },
  });
});

export const GET = withRequestContext(rawGetHandler);
