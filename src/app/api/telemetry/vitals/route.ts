import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { webVitalsLogs, projects } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Tamaño máximo aceptado del cuerpo JSON (los beacons reales son < 8KB).
// Un solo check mata el vector de DB-bloat independientemente del schema.
const MAX_BODY_BYTES = 65_536;

/** Registro suelto de las listas RUM: claves string, valores primitivos. */
const boundedEntry = z.record(z.string(), z.union([z.string().max(1024), z.number(), z.boolean(), z.null()]));

// Define the validation schema for the incoming RUM v2.0 payload
const vitalsSchema = z.object({
  projectId: z.string().uuid(),
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

// SECURITY: Simple in-memory rate limiter for telemetry endpoint (60 req/min per IP).
// Replace with Redis-backed limiter (Upstash) for multi-instance deployments.
const telemetryRateLimit = new Map<string, { count: number; resetTime: number }>();

function checkTelemetryRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = telemetryRateLimit.get(ip);
  if (!record || now > record.resetTime) {
    telemetryRateLimit.set(ip, { count: 1, resetTime: now + 60_000 });
    return true;
  }
  if (record.count >= 60) return false;
  record.count++;
  return true;
}

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

export async function POST(request: NextRequest) {
  try {
    // Rate limiting by IP
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0]!.trim() : (request.headers.get('x-real-ip') ?? 'unknown');
    if (!checkTelemetryRateLimit(ip)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

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

// Verify project exists and is active (not deleted / not hidden)
const project = await db.query.projects.findFirst({
  where: eq(projects.id, data.projectId),
  columns: { id: true, deletedAt: true, isDeleted: true, isHidden: true },
});

if (!project || project.deletedAt !== null || project.isDeleted || project.isHidden) {
  return NextResponse.json({ error: 'Project not found or inactive' }, { status: 404 });
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

    return new NextResponse(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    });
  } catch (error) {
    console.error('Telemetry error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

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
