import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/server/intelligence/enterprise/api-auth";
import { db } from "@/shared/db";
import { intelligenceInvestigations, projects } from "@/shared/db/schemas";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    // 1. Validar autenticación vía API Key
    const authContext = await validateApiKey(req);
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized. Invalid or missing API Key." }, { status: 401 });
    }

    const body = await req.json();
    const { projectId, targets } = body;

    if (!projectId || !targets || !Array.isArray(targets)) {
      return NextResponse.json({ error: "Invalid payload. 'projectId' and 'targets' (array) are required." }, { status: 400 });
    }

    if (targets.length === 0 || targets.length > 50) {
      return NextResponse.json({ error: "The 'targets' array must contain between 1 and 50 elements." }, { status: 400 });
    }

    // 2. Verificar acceso al proyecto
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId)
    });

    if (!project || project.ownerId !== authContext.userId) {
      return NextResponse.json({ error: "Project not found or access denied." }, { status: 404 });
    }

    // 3. Crear las investigaciones en estado 'queued' o 'draft'
    // En una implementación robusta, esto debería despacharse vía Trigger.dev a un Worker
    // para procesar el array de forma asíncrona.
    
    const createdInvestigations = [];

    for (const target of targets) {
      // Normalización muy básica del target para el bulk insert
      let targetType: "domain" | "ip" | "url" | "email" = "domain";
      if (target.includes("@")) targetType = "email";
      else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(target)) targetType = "ip";
      else if (target.startsWith("http")) targetType = "url";

      const [inv] = await db.insert(intelligenceInvestigations).values({
        projectId,
        ownerId: authContext.userId,
        title: `Bulk Analysis: ${target}`,
        target: target,
        normalizedTarget: target.toLowerCase(),
        targetType,
        status: "queued"
      }).returning();

      createdInvestigations.push(inv);
    }

    // IMPORTANTE: Aquí se despacharía el Trigger a 'audit.trigger.ts' enviando los investigationIds 
    // para procesamiento asíncrono en background. (Omitido por concisión arquitectónica)

    return NextResponse.json({
      success: true,
      message: `${createdInvestigations.length} investigations queued for processing.`,
      investigations: createdInvestigations.map(i => ({ id: i.id, target: i.target }))
    }, { status: 202 });

  } catch (error: any) {
    console.error("Bulk API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
