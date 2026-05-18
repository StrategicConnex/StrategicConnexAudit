import { NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { projects, uptimeLogs } from '@/shared/db/schemas';
import { isNull } from 'drizzle-orm';

export const maxDuration = 60; // 1 minute timeout
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. Verify Vercel Cron Secret for security
    const authHeader = request.headers.get('authorization');
    if (
      process.env.NODE_ENV === 'production' &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get all active projects
    const activeProjects = await db.query.projects.findMany({
      where: isNull(projects.deletedAt),
    });

    if (activeProjects.length === 0) {
      return NextResponse.json({ message: 'No active projects to monitor' });
    }

    const results = [];

    // 3. Process each project
    // Note: We're doing this sequentially to avoid rate limiting, 
    // but in a real-world scenario with many projects, we might batch these.
    for (const project of activeProjects) {
      if (!project.domain) continue;

      let url = project.domain;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = `https://${url}`;
      }

      const startTime = performance.now();
      let isUp = false;
      let statusCode = null;
      let error = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'StrategicAudit-UptimeMonitor/1.0',
          },
        });
        
        clearTimeout(timeoutId);
        
        statusCode = response.status;
        isUp = response.ok || (response.status >= 200 && response.status < 400);
      } catch (err) {
        const fetchErr = err as { message?: string };
        error = fetchErr.message || 'Unknown error';
      }

      const endTime = performance.now();
      const responseTimeMs = Math.round(endTime - startTime);

      // Log the result
      await db.insert(uptimeLogs).values({
        projectId: project.id,
        isUp,
        statusCode,
        responseTimeMs,
        errorMessage: error,
      });

      // Update project status if needed
      // If we have an 'up'/'down' status field on the project, we'd update it here.
      // Currently, projects only have `isActive`, which is a user preference, not health.
      // But we can add a 'healthStatus' field later if needed.

      results.push({
        projectId: project.id,
        url,
        isUp,
        statusCode,
        responseTimeMs,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const err = error as { message?: string };
    console.error('Uptime cron error:', error);
    return NextResponse.json({ error: err.message || 'Cron error' }, { status: 500 });
  }
}
