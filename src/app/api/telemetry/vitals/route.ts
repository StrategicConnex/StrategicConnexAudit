import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { webVitalsLogs, projects } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from "@/lib/logger";
import { withRateLimit } from '@/shared/lib/ratelimit';

// Tamaño máximo aceptado del cuerpo JSON (los beacons reales son < 8KB).
// Un solo check mata el vector de DB-bloat independientemente del schema.
const MAX_BODY_BYTES = 65_536;

/** Registro suelto de las listas RUM: claves string, valores primitivos. */
const boundedEntry = z.record(z.string(), z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]));

// Define the validation schema for the incoming RUM v2.0 payload
const vitalsSchema = z.object({
  projectId: z.string().uuid(),
  // Secreto del beacon (P0-3): el snippet lo envía en el cuerpo. Opcional
  // para no romper instalaciones legacy sin secreto (secret NULL = abierto).
  beaconToken: z.string().max(128).optional(),
  url: z.string().min(1).max(2048),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional().default('desktop'),

  // RUM v2.0 enriched parameters
  sessionId: z.string().max(128).optional(),
  path: z.string().max(512).optional(),
  device: z.object({
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    platform: z.string().max(64).optional(),
    screenWidth: z.number().optional(),
    screenHeight: z.number().optional(),
    dpr: z.number().optional(),
    language: z.string().max(32).optional(),
    browser: z.string().max(64).optional(),
    browserVersion: z.string().max(32).optional(),
  }).optional(),

  // Formas exactas que emite public/scripts/vitals.js (claves desconocidas
  // se descartan al parsear — antes eran z.any() sin límite).
  connection: z.object({
    effectiveType: z.string().max(16).optional(),
    downlink: z.number().optional(),
    rtt: z.number().optional(),
    saveData: z.boolean().optional(),
  }).optional(),
  memory: z.object({
    usedJSHeapSize: z.number().optional(),
    totalJSHeapSize: z.number().optional(),
    jsHeapSizeLimit: z.number().optional(),
  }).optional(),
  timing: z.record(z.string(), z.number()).optional(),

  vitals: z.object({
    cls: z.number().optional(),
    lcp: z.number().optional(),
    inp: z.number().optional(),
    fid: z.number().optional(),
    fcp: z.number().optional(),
    ttfb: z.number().optional(),
    // Attribution build de web-vitals@3.5.2 (TD-23.b / H-10b): selector del
    // elemento LCP + descomposición en campo (load delay / load time /
    // render delay). Sin declararlas aquí, zod las descarta al parsear y
    // mueren antes de rawPayload — regresión detectada en la verificación
    // post-push (2026-10-27T00:07Z: filas sin lcpElement pese al deploy).
    lcpElement: z.string().max(512).optional(),
    lcpTTFB: z.number().optional(),
    lcpResourceLoadDelay: z.number().optional(),
    lcpResourceLoadTime: z.number().optional(),
    lcpElementRenderDelay: z.number().optional(),
  }).optional(),

  // Legacy payload compatibility
  metrics: z.object({
    LCP: z.number().optional(),
    INP: z.number().optional(),
    CLS: z.number().optional(),
    TTFB: z.number().optional(),
    FCP: z.number().optional(),
  }).optional(),

  pageViews: z.number().optional(),
  sessionDuration: z.number().optional(),
  timeOnPage: z.number().optional(),
  // El cliente envía máx 10/20/10 por lote; se tolera hasta 50 por margen.
  errors: z.array(boundedEntry).max(50).optional(),
  interactions: z.array(boundedEntry).max(50).optional(),
  resources: z.array(boundedEntry).max(50).optional(),
  isFinal: z.boolean().optional(),
});

// SECURITY: Determine allowed origins from env var.
// Set ALLOWED_TELEMETRY_ORIGINS=https://mysite.com,https://otherdomain.com in .env
// In development, all origins are allowed.
function getCorsOrigin(requestOrigin: string | null): string {
  if (process.env.NODE_ENV !== 'production') return requestOrigin ?? '*';
  const allowedRaw = process.env.ALLOWED_TELEMETRY_ORIGINS ?? '';
  const allowed = allowedRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (!requestOrigin || !allowed.includes(requestOrigin)) return 'null';
  return requestOrigin;
}

/**
 * Respuesta fail-closed cuando la capa DB de telemetría no responde
 * (fix 500-opaco 2026-10-19). Log seguro sin PII del payload: solo etapa +
 * projectId + código PG + mensaje. El status 503 es auto-diagnóstico para el
 * beacon ("servidor caído") sin necesidad de leer el body cross-origin.
 */
function telemetryUnavailableResponse(
  stage: 'lookup' | 'insert',
  projectId: string,
  corsOrigin: string,
  error: unknown
): NextResponse {
  const pgCode = (error as { code?: string } | null)?.code;
  logger.error('[telemetry/vitals] DB error:', {
    stage,
    projectId,
    pgCode: pgCode ?? undefined,
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: 'telemetry_unavailable', stage },
    {
      status: 503,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    }
  );
}

export const POST = withRateLimit(
  { limit: 60, window: 60, prefix: "telemetry" },
  async (request: NextRequest) => {
  try {
    // CORS origin validation
    const origin = request.headers.get('origin');
    const corsOrigin = getCorsOrigin(origin);
    if (corsOrigin === 'null' && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Forbidden: origin not allowed' }, {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': 'null' },
      });
    }

    // Guard de tamaño: rechazar cuerpos anormalmente grandes antes de parsear
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const body = await request.json();
    if (JSON.stringify(body).length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const parsed = vitalsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error }, { status: 400 });
    }

    const data = parsed.data;

    // ── Catch granular DB (fix 500-opaco 2026-10-19) ────────────────────────
    // Repro: POST con projectId inexistente devolvía 500 en prod en lugar de
    // 404 — el throw venía de la capa DB (findFirst/insert) y el catch global
    // lo colapsaba en 500 sin sonido diagnóstico. Ahora: fallo de conexión →
    // 503 fail-closed con log seguro; FK violation (proyecto borrado entre el
    // lookup y el insert, pg `23503`) → 404 honesto.

    // Verify project exists and is active (not deleted / not hidden)
    let project: { id: string; deletedAt: Date | null; isDeleted: boolean; isHidden: boolean; beaconSecret: string | null } | undefined;
    try {
      project = await db.query.projects.findFirst({
        where: eq(projects.id, data.projectId),
        columns: { id: true, deletedAt: true, isDeleted: true, isHidden: true, beaconSecret: true },
      });
    } catch (lookupError) {
      return telemetryUnavailableResponse('lookup', data.projectId, corsOrigin, lookupError);
    }

if (!project || project.deletedAt !== null || project.isDeleted || project.isHidden) {
  return NextResponse.json({ error: 'Project not found or inactive' }, { status: 404 });
}

// Beacon ownership (P0-3): si el proyecto tiene secreto, el cuerpo debe
// traerlo. Proyectos legacy sin secreto (NULL) siguen abiertos hasta que el
// owner lo genera desde la tarjeta RUM.
if (project.beaconSecret && data.beaconToken !== project.beaconSecret) {
  return NextResponse.json({ error: 'Beacon token inválido' }, { status: 401 });
}

    // Extract device type
    const incomingDeviceType = data.device?.deviceType || data.deviceType;
    const finalDeviceType = (incomingDeviceType === 'tablet') ? 'desktop' : incomingDeviceType;

    // Extract metrics supporting both legacy and RUM v2.0 formats
    const lcp = data.vitals?.lcp ?? data.metrics?.LCP ?? null;
    const inp = data.vitals?.inp ?? data.metrics?.INP ?? null;
    const cls = data.vitals?.cls ?? data.metrics?.CLS ?? null;
    const ttfb = data.vitals?.ttfb ?? data.metrics?.TTFB ?? null;
    const fcp = data.vitals?.fcp ?? data.metrics?.FCP ?? null;
    const fid = data.vitals?.fid ?? null;

    // Retrieve geo-location/country code from Vercel headers
    const country = request.headers.get('x-vercel-ip-country') || request.headers.get('x-vercel-country') || null;

    // Insert enriched telemetry log
    try {
      await db.insert(webVitalsLogs).values({
      projectId: data.projectId,
      url: data.url,
      deviceType: finalDeviceType as 'desktop' | 'mobile',
      lcp: lcp !== null ? String(lcp) : null,
      inp: inp !== null ? String(inp) : null,
      cls: cls !== null ? String(cls) : null,
      ttfb: ttfb !== null ? String(ttfb) : null,
      fcp: fcp !== null ? String(fcp) : null,
      sessionId: data.sessionId || null,
      path: data.path || null,
      browser: data.device?.browser || null,
      country: country,
      fid: fid !== null ? String(fid) : null,
      pageViews: data.pageViews ?? 1,
      sessionDuration: data.sessionDuration || null,
      timeOnPage: data.timeOnPage || null,
      errors: data.errors || null,
      interactions: data.interactions || null,
      resources: data.resources || null,
      connection: data.connection || null,
      memory: data.memory || null,
      timing: data.timing || null,
      // M-1: persistir el payload PARSEADO (claves desconocidas descartadas
      // y acotado), nunca el body crudo controlado por el cliente.
      rawPayload: data,
      });
    } catch (insertError) {
      // FK violation (pg 23503): el proyecto fue borrado entre el lookup y
      // el insert → el beacon apunta a algo que ya no existe → 404.
      if ((insertError as { code?: string }).code === '23503') {
        logger.error('[telemetry/vitals] FK violation tras lookup:', { projectId: data.projectId });
        return NextResponse.json(
          { error: 'project_not_found', projectId: data.projectId },
          {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': corsOrigin },
          }
        );
      }
      return telemetryUnavailableResponse('insert', data.projectId, corsOrigin, insertError);
    }

    return new NextResponse(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    });
  } catch (error) {
    logger.error('Telemetry error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
  }
);

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const corsOrigin = getCorsOrigin(origin);
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
