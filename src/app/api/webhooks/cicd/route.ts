import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/server/security/cicd-helper";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-scaudit-signature") || "";
    const secret = process.env.SCAUDIT_WEBHOOK_SECRET || "default_webhook_secret_for_dev";

    const isValid = verifyWebhookSignature(rawBody, signature, secret);

    if (!isValid && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "Firma HMAC inválida o no provista" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(rawBody || "{}");

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
