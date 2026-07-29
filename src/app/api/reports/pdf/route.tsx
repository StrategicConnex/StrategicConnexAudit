import { NextRequest, NextResponse } from 'next/server';
import { renderToStream } from '@react-pdf/renderer';
import { Readable } from 'stream';
import { eq, and, desc } from 'drizzle-orm';
import { createClient } from '@/shared/lib/supabase/server';
import { directDb } from '@/shared/db';
import { withRLS } from '@/shared/db/rls';
import { redis } from '@/shared/lib/ratelimit';
import {
  projects,
  intelligenceInvestigations,
  intelligenceFindings,
  intelligenceAssets,
} from '@/shared/db/schemas';
import { withRateLimit } from '@/shared/lib/ratelimit';
import { PdfReport, type PdfReportData, type PdfFinding, type PdfAsset, type WhiteLabelBranding } from '@/server/reports/pdf-template';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reports/pdf
 * Generate a downloadable white-label PDF security report.
 *
 * Body:
 *   projectId        (string, required) — UUID of the project
 *   branding         (object, optional) — { agencyName, primaryColor, logoUrl }
 *   investigationId  (string, optional) — UUID of a specific investigation
 *   genId            (string, optional) — UUID for SSE progress tracking
 *
 * Response: application/pdf binary stream
 * Header:  X-Generation-Id (if genId was provided)
 */

// Helper: write progress to Redis (fire-and-forget, non-blocking)
function reportProgress(genId: string | undefined, percent: number, step: string, status?: string) {
  if (!genId) return;
  const key = `pdf_progress:${genId}`;
  // Pass raw object — Upstash handles serialization internally
  redis.set(key, { percent, step, status: status || 'working' })
    .catch((e: unknown) => console.warn('[pdf-progress] Redis write failed:', e));
}

export const POST = withRateLimit(
  {
    limit: 5,
    window: 60,
    prefix: 'report_pdf',
    authenticate: async () => {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
  },
  async (req: NextRequest, userId: string) => {
    let genId: string | undefined;
    try {
      const body = await req.json();
      const { projectId, investigationId, branding } = body as {
        projectId: string;
        investigationId?: string;
        branding?: WhiteLabelBranding;
        genId?: string;
      };
      genId = body.genId;

      if (!projectId) {
        return NextResponse.json(
          { success: false, error: 'Se requiere projectId' },
          { status: 400 },
        );
      }

      reportProgress(genId, 5, 'Verificando acceso al proyecto...');

      // Fetch project with ownership check
      const projectData = await withRLS(userId, async (tx) => {
        const [p] = await tx
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.ownerId, userId)))
          .limit(1);
        return p || null;
      });

      if (!projectData) {
        reportProgress(genId, 0, 'Error', 'error');
        return NextResponse.json(
          { success: false, error: 'Proyecto no encontrado o acceso denegado' },
          { status: 404 },
        );
      }

      reportProgress(genId, 15, 'Obteniendo investigaciones...');

      // Fetch investigations for this project (or specific one)
      let investigations;
      if (investigationId) {
        investigations = await directDb.query.intelligenceInvestigations.findMany({
          where: and(
            eq(intelligenceInvestigations.id, investigationId),
            eq(intelligenceInvestigations.projectId, projectId),
          ),
          orderBy: [desc(intelligenceInvestigations.createdAt)],
          limit: 20,
        });
      } else {
        investigations = await directDb.query.intelligenceInvestigations.findMany({
          where: eq(intelligenceInvestigations.projectId, projectId),
          orderBy: [desc(intelligenceInvestigations.createdAt)],
          limit: 20,
        });
      }

      if (investigations.length === 0) {
        reportProgress(genId, 0, 'Error', 'error');
        return NextResponse.json(
          { success: false, error: 'No se encontraron investigaciones para este proyecto' },
          { status: 404 },
        );
      }

      reportProgress(genId, 25, `Cargando findings y assets de ${investigations.length} investigaciones...`);

      // Build sections from investigations
      const sections = await Promise.all(
        investigations.map(async (inv, idx) => {
          const findings = await directDb.query.intelligenceFindings.findMany({
            where: eq(intelligenceFindings.investigationId, inv.id),
            orderBy: (fields: any) => [fields.createdAt],
          });

          const pdfFindings: PdfFinding[] = findings.map((f: any) => ({
            severity: f.severity ?? 'info',
            title: f.title ?? 'Untitled finding',
            description: f.description ?? '',
            recommendation: f.recommendation,
            affectedAsset: f.affectedAsset,
            mitreTechnique: (f.evidence as Record<string, unknown>)?.['_toolId'] as string ?? null,
          }));

          const severeCount = pdfFindings.filter(
            (f) => f.severity === 'critical' || f.severity === 'high',
          ).length;

          // Fetch assets per investigation
          const assetRecords = await directDb.query.intelligenceAssets.findMany({
            where: eq(intelligenceAssets.investigationId, inv.id),
            orderBy: [desc(intelligenceAssets.firstSeenAt)],
            limit: 200,
          });

          const pdfAssets: PdfAsset[] = assetRecords.map((a: any) => ({
            assetType: a.assetType ?? 'other',
            value: a.value ?? '',
            ip: a.ip ?? null,
            firstSeenAt: a.firstSeenAt?.toISOString?.() ?? null,
            lastSeenAt: a.lastSeenAt?.toISOString?.() ?? null,
          }));

          // Report sub-progress
          const subProgress = 25 + Math.round(((idx + 1) / investigations.length) * 35);
          reportProgress(genId, subProgress, `Procesada investigación ${idx + 1} de ${investigations.length}...`);

          return {
            id: inv.id,
            title: inv.title,
            score: inv.score,
            summary: inv.summary,
            findings: pdfFindings,
            assets: pdfAssets,
            totalFindings: pdfFindings.length,
            severeCount,
          };
        }),
      );

      reportProgress(genId, 65, 'Calculando scores y preparando datos...');

      // Calculate overall score (average across all investigations)
      const scores = sections.filter((s) => s.score != null).map((s) => s.score!);
      const overallScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

      const reportData: PdfReportData = {
        projectName: projectData.name,
        projectDomain: projectData.domain,
        target: investigations[0]?.target ?? projectData.domain,
        targetType: investigations[0]?.targetType ?? 'domain',
        date: new Date().toLocaleDateString('es-AR', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
        overallScore,
        branding: branding ?? {},
        sections,
      };

      reportProgress(genId, 75, 'Renderizando páginas del PDF...');

      // Render PDF to stream
      const stream = await renderToStream(<PdfReport data={reportData} />);

      reportProgress(genId, 90, 'Generando archivo PDF...');

      // Collect stream into buffer (Readable is async-iterable)
      const chunks: Buffer[] = [];
      for await (const chunk of stream as Readable) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      const pdfBuffer = Buffer.concat(chunks);

      reportProgress(genId, 100, 'PDF listo', 'complete');

      const filename = `SCAUDIT_Report_${projectData.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
      };

      if (genId) {
        responseHeaders['X-Generation-Id'] = genId;
      }

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: responseHeaders,
      });

    } catch (error: any) {
      reportProgress(genId, 0, 'Error', 'error');
      console.error('POST /api/reports/pdf error:', error);
      return NextResponse.json(
        { success: false, error: `Error al generar PDF: ${error.message || 'Error desconocido'}` },
        { status: 500 },
      );
    }
  },
);
