import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWebhookSignature } from "@/server/security/cicd-helper";

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
    const shape = z.object({
      commit: z.string().max(120).optional(),
      ref: z.string().max(256).optional(),
    }).catchall(z.unknown()).safeParse(JSON.parse(rawBody || "{}"));
    if (!shape.success) {
      return NextResponse.json(
        { success: false, error: "Payload inválido" },
        { status: 400 }
      );
    }
    const payload = shape.data;

    return NextResponse.json({
      success: true,
      message: "Escaneo de seguridad disparado desde CI/CD exitosamente",
      triggerTime: new Date().toISOString(),
      payloadSummary: {
        commit: payload.commit || "manual",
        ref: payload.ref || "main",
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Error procesando el webhook de CI/CD" },
      { status: 500 }
    );
  }
}
