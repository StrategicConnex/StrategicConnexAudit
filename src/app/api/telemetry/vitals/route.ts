import { NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { webVitalsLogs, projects } from '@/shared/db/schemas';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

// Define the validation schema for the incoming payload
const vitalsSchema = z.object({
  projectId: z.string().uuid(),
  url: z.string().min(1),
  deviceType: z.enum(['desktop', 'mobile']).optional().default('desktop'),
  metrics: z.object({
    LCP: z.number().optional(),
    INP: z.number().optional(),
    CLS: z.number().optional(),
    TTFB: z.number().optional(),
    FCP: z.number().optional(),
  })
});

export async function POST(request: Request) {
  try {
    // Basic CORS for public endpoint
    // In production, we might want to restrict this via allowedOrigins per project,
    // but for now we accept telemetry if the projectId is valid.

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

    // Return a 204 No Content for successful telemetry
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Telemetry error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  // Handle preflight requests for CORS
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Adjust in production
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
