import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/server/intelligence/enterprise/api-auth";
import { db } from "@/shared/db";
import { intelligenceInvestigations, projects } from "@/shared/db/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { checkIntelScanRateLimit, buildRateLimitHeaders } from "@/shared/lib/ratelimit";

const bulkSchema = z.object({
  projectId: z.string().uuid(),
  targets: z
    .array(z.string().min(1).max(2048))
    .min(1)
    .max(50),
});

function normalizeTarget(raw: string): {
  target: string;
  normalizedTarget: string;
  targetType: "domain" | "ip" | "url" | "email";
} {
  const target = raw.trim();
  const normalizedTarget = target.toLowerCase();

  let targetType: "domain" | "ip" | "url" | "email" = "domain";
  if (normalizedTarget.includes("@")) targetType = "email";
  else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalizedTarget)) targetType = "ip";
  else if (normalizedTarget.startsWith("http")) targetType = "url";

  return { target, normalizedTarget, targetType };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validar autenticación vía API Key
    const authContext = await validateApiKey(req);
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    }

    // SECURITY: validación zod (antes se aceptaban strings de tamaño
    // arbitrario y sin rate limit — vector de bloat de BD)
    const body = await req.json();
    const parseResult = bulkSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid payload. 'projectId' (uuid) and 'targets' (array of 1–50 strings, max 2048 chars) are required." },
        { status: 400 },
      );
    }

    // Rate limit por usuario (misma cuota que el resto del motor intelligence)
    const rateLimit = await checkIntelScanRateLimit(authContext.userId);
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Scan rate limit exceeded. Try again later." },
        { status: 429, headers: buildRateLimitHeaders(rateLimit) },
      );
    }

    const { projectId, targets } = parseResult.data;

    // 2. Verificar acceso al proyecto
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, authContext.userId)),
      columns: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found or access denied." }, { status: 404 });
    }

    // 3. Insert MASIVO en estado 'queued' (un solo statement; antes había un
    // INSERT por target dentro de un bucle)
    // NOTA: aquí se despacharía el Trigger a 'audit.trigger.ts' enviando los
    // investigationIds para procesamiento asíncrono en background.
    const rows = targets.map((raw) => {
      const { target, normalizedTarget, targetType } = normalizeTarget(raw);
      return {
        projectId,
        ownerId: authContext.userId,
        title: `Bulk Analysis: ${target}`,
        target,
        normalizedTarget,
        targetType,
        status: "queued" as const,
      };
    });

    const createdInvestigations = await db
      .insert(intelligenceInvestigations)
      .values(rows)
      .returning({ id: intelligenceInvestigations.id, target: intelligenceInvestigations.target });

    return NextResponse.json({
      success: true,
      message: `${createdInvestigations.length} investigations queued for processing.`,
      investigations: createdInvestigations,
    }, { status: 202 });

  } catch (error: unknown) {
    console.error("Bulk API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
