import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { webVitalsLogs, projects } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Define the validation schema for the incoming payload
const vitalsSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().min(1).max(2048),
  deviceType: z.enum(['desktop', 'mobile']).optional().default('desktop'),
  metrics: z.object({
    LCP: z.number().optional(),
    INP: z.number().optional(),
    CLS: z.number().optional(),
    TTFB: z.number().optional(),
    FCP: z.number().optional(),
  })
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

    const { projectId, url, deviceType, metrics } = parsed.data;

    // Verify project exists and is active (not deleted)
    const project = await db.query.projects.findFirst({
      where: eq(projects.id, projectId),
      columns: { id: true, deletedAt: true },
    });

    if (!project || project.deletedAt !== null) {
      return NextResponse.json({ error: 'Project not found or inactive' }, { status: 404 });
    }

    // Insert log
    await db.insert(webVitalsLogs).values({
      projectId,
      url,
      deviceType,
      lcp: metrics.LCP !== undefined ? String(metrics.LCP) : null,
      inp: metrics.INP !== undefined ? String(metrics.INP) : null,
      cls: metrics.CLS !== undefined ? String(metrics.CLS) : null,
      ttfb: metrics.TTFB !== undefined ? String(metrics.TTFB) : null,
      fcp: metrics.FCP !== undefined ? String(metrics.FCP) : null,
    });

    return new NextResponse(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
    });
  } catch (error: any) {
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

