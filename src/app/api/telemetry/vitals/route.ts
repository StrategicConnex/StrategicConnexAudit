import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { webVitalsLogs, projects } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createHash } from 'crypto';

// Define the validation schema for the incoming RUM v2.0 payload
const vitalsSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().min(1).max(2048),
  deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional().default('desktop'),
  
  // RUM v2.0 enriched parameters
  sessionId: z.string().optional(),
  path: z.string().optional(),
  device: z.object({
    deviceType: z.enum(['desktop', 'mobile', 'tablet']).optional(),
    platform: z.string().optional(),
    screenWidth: z.number().optional(),
    screenHeight: z.number().optional(),
    dpr: z.number().optional(),
    language: z.string().optional(),
    browser: z.string().optional(),
    browserVersion: z.string().optional(),
  }).optional(),
  
  connection: z.any().optional(),
  memory: z.any().optional(),
  timing: z.any().optional(),
  
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
  errors: z.array(z.any()).optional(),
  interactions: z.array(z.any()).optional(),
  resources: z.array(z.any()).optional(),
  isFinal: z.boolean().optional(),
});

function hashIp(ip: string): string {
  const salt = process.env.IP_SALT || 'default-sa-rum-salt';
  return createHash('sha256').update(ip + salt).digest('hex');
}

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
    const ip = forwarded ? forwarded.split(',')[0].trim() : (request.headers.get('x-real-ip') ?? 'unknown');
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

    const body = await request.json();
    const parsed = vitalsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error }, { status: 400 });
    }

    const data = parsed.data;

    // Verify project exists and is active (not deleted)
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, data.projectId),
      columns: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
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
      rawPayload: body,
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
