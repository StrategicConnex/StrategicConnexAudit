'use server';

import { authenticatedAction } from "@/shared/lib/actions";
import { z } from 'zod';
import { keywordTargets, rankHistory, projects } from '@/shared/db/schemas';
import { eq, and, desc } from 'drizzle-orm';

const ExportCSVSchema = z.object({
  projectId: z.string().uuid(),
});

export const exportKeywordsCSV = authenticatedAction(
  ExportCSVSchema,
  async ({ projectId }, { user, tx }) => {
    // 1. Verificar pertenencia del proyecto
    const project = await tx.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
    });

    if (!project) {
      throw new Error("Proyecto no encontrado o no autorizado");
    }

    // 2. Obtener todas las keywords del proyecto
    const keywords = await tx.query.keywordTargets.findMany({
      where: eq(keywordTargets.projectId, projectId),
    });

    if (keywords.length === 0) {
      // Retornar cabeceras vacías si no hay datos
      return {
        success: true,
        csv: "Keyword,Location,Device,Target URL,Latest Position,Search Volume,CPC\n",
        filename: `keywords_${project.name}_${new Date().toISOString().split('T')[0]}.csv`
      };
    }

    // 3. Obtener el historial más reciente para cada keyword
    // Hacemos las consultas por separado o usando joins. Para simplicidad con query builder:
    const keywordIds = keywords.map(k => k.id);
    
    // Obtenemos todos los historiales de estas keywords (en una base real gigante habría que limitar,
    // pero para exportar reporte completo sirve).
    // Alternativamente, un left join manual con drizzle:
    const data = await tx.select({
      keyword: keywordTargets.keyword,
      location: keywordTargets.location,
      device: keywordTargets.device,
      targetUrl: keywordTargets.targetUrl,
      position: rankHistory.position,
      searchVolume: rankHistory.searchVolume,
      cpc: rankHistory.cpc,
      checkedAt: rankHistory.checkedAt
    })
    .from(keywordTargets)
    .leftJoin(rankHistory, eq(keywordTargets.id, rankHistory.keywordId))
    .where(eq(keywordTargets.projectId, projectId))
    .orderBy(desc(rankHistory.checkedAt));

    // Consolidar solo el registro más reciente por keyword
    const latestDataMap = new Map<string, typeof data[0]>();
    for (const row of data) {
      if (!latestDataMap.has(row.keyword)) {
        latestDataMap.set(row.keyword, row);
      }
    }

    const latestData = Array.from(latestDataMap.values());

    // 4. Formatear como CSV
    const escapeCsv = (str: any) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const headers = ["Keyword", "Location", "Device", "Target URL", "Latest Position", "Search Volume", "CPC"];
    const rows = latestData.map(row => [
      escapeCsv(row.keyword),
      escapeCsv(row.location),
      escapeCsv(row.device),
      escapeCsv(row.targetUrl),
      escapeCsv(row.position),
      escapeCsv(row.searchVolume),
      escapeCsv(row.cpc)
    ].join(','));

    const csvContent = [headers.join(','), ...rows].join('\n');

    return {
      success: true,
      csv: csvContent,
      filename: `keywords_${project.domain}_${new Date().toISOString().split('T')[0]}.csv`
    };
  }
);
