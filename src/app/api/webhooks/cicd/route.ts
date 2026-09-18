import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWebhookSignature, evaluateGate, type GatePolicy } from "@/server/security/cicd-helper";
import { directDb } from "@/shared/db";
import { audits, issues } from "@/shared/db/schemas";
import { desc, eq, sql, count } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-scaudit-signature") || "";
    // SECURITY: fail-closed. Sin secreto configurado el webhook se rechaza
    // siempre — nunca se acepta un secreto por defecto ni se salta la
    // verificación fuera de producción.
    const secret = process.env.SCAUDIT_WEBHOOK_SECRET;
    if (!secret) {
      return NextResponse.json(
        { success: false, error: "Webhook no configurado: falta SCAUDIT_WEBHOOK_SECRET" },
        { status: 503 }
      );
    }

    const isValid = verifyWebhookSignature(rawBody, signature, secret);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Firma HMAC inválida o no provista" },
        { status: 401 }
      );
    }

    // P2-4: schema cerrado (solo commit/ref acotados; resto se ignora).
    // B-1: projectId opcional + política failIf para quality gate en PRs.
    const shape = z.object({
      commit: z.string().max(120).optional(),
      ref: z.string().max(256).optional(),
      projectId: z.string().uuid().optional(),
      failIf: z.object({
        maxCritical: z.number().int().min(0).max(1000).optional(),
        minScore: z.number().min(0).max(100).optional(),
      }).optional(),
    }).catchall(z.unknown()).safeParse(JSON.parse(rawBody || "{}"));
    if (!shape.success) {
      return NextResponse.json(
        { success: false, error: "Payload inválido" },
        { status: 400 }
      );
    }
    const payload = shape.data;

    // Sin proyecto: solo acuse (compat con el snippet original).
    if (!payload.projectId) {
      return NextResponse.json({
        success: true,
        message: "Escaneo de seguridad disparado desde CI/CD exitosamente",
        triggerTime: new Date().toISOString(),
        payloadSummary: {
          commit: payload.commit || "manual",
          ref: payload.ref || "main",
        },
      });
    }

    // B-1: veredicto síncrono sobre la ÚLTIMA auditoría completada.
    // El projectId es UUID no adivinable + HMAC global: no se expone PII,
    // solo el veredicto y conteos del propio proyecto del caller.
    const policy: GatePolicy = {
      maxCritical: payload.failIf?.maxCritical ?? 0,
      minScore: payload.failIf?.minScore ?? 70,
    };

    const [latest] = await directDb
      .select({ id: audits.id })
      .from(audits)
      .where(eq(audits.projectId, payload.projectId))
      .orderBy(desc(audits.createdAt))
      .limit(1);

    if (!latest) {
      return NextResponse.json({
        success: true,
        gate: "fail",
        reasons: ["Sin auditorías registradas para este proyecto"],
        commit: payload.commit || "manual",
        ref: payload.ref || "main",
      });
    }

    const [stats] = await directDb
      .select({
        criticalCount: count(sql`case when ${issues.severity} = 'critical' then 1 end`),
        warningCount: count(sql`case when ${issues.severity} = 'warning' then 1 end`),
      })
      .from(issues)
      .where(eq(issues.auditId, latest.id));

    const criticals = Number(stats?.criticalCount || 0);
    const warnings = Number(stats?.warningCount || 0);
    const score = Math.max(0, 100 - criticals * 15 - warnings * 5);
    const evaluation = evaluateGate(score, criticals, warnings, policy);

    return NextResponse.json({
      success: true,
      ...evaluation,
      commit: payload.commit || "manual",
      ref: payload.ref || "main",
      triggerTime: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Error procesando el webhook de CI/CD" },
      { status: 500 }
    );
  }
}
