import { NextResponse } from 'next/server';
import { db } from '@/shared/db';
import { projects, uptimeLogs } from '@/shared/db/schemas';
import { and, eq, isNull } from 'drizzle-orm';
import { validateSafeUrl, normalizeUrl, safeFetchFollow } from "@/server/intelligence/security/egress-guard";
import { isCronAuthorized } from "@/server/auth/cron";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

export const maxDuration = 60; // 1 minute timeout
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 100;
const CONCURRENCY = 6;
const PROJECT_TIMEOUT_MS = 5_000;
const TIME_BUDGET_MS = 50_000;
const DAY_MS = 86_400_000;

interface CheckOutcome {
  projectId: string;
  url: string;
  isUp: boolean;
  statusCode: number | null;
  responseTimeMs: number;
}

interface CheckResult extends CheckOutcome {
  error: string | null;
}

async function checkProject(project: { id: string; domain: string | null }): Promise<CheckResult> {
  const startTime = performance.now();
  let url = "";
  let isUp = false;
  let statusCode: number | null = null;
  let error: string | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Egress-guard SSRF: el domain del proyecto es input del usuario.
    // Mismo patrón que uptime.trigger.ts (validateSafeUrl + normalizeUrl).
    url = normalizeUrl(project.domain ?? "");
    await validateSafeUrl(url);

    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), PROJECT_TIMEOUT_MS);

    // P2-4: safeFetchFollow revalida cada redirect (cierra TOCTOU).
    const response = await safeFetchFollow(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'StrategicAudit-UptimeMonitor/1.0',
      },
    });

    statusCode = response.status;
    isUp = response.ok || (response.status >= 200 && response.status < 400);
  } catch (err) {
    const fetchErrMsg = err instanceof Error ? err.message : String(err);
    error = fetchErrMsg || 'Unknown error';
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const responseTimeMs = Math.round(performance.now() - startTime);

  await db.insert(uptimeLogs).values({
    projectId: project.id,
    isUp,
    statusCode,
    responseTimeMs,
    errorMessage: error,
  });

  return { projectId: project.id, url, isUp, statusCode, responseTimeMs, error };
}

async function rawGet(request: Request) {
  try {
    // 1. Verify Vercel Cron Secret (timing-safe, fail-closed en producción)
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const activeProjects = await db.query.projects.findMany({
      where: and(isNull(projects.deletedAt), eq(projects.isDeleted, false), eq(projects.isHidden, false)),
      limit: PAGE_SIZE,
      orderBy: [projects.createdAt],
    });

    if (activeProjects.length === 0) {
      return NextResponse.json({ message: 'No active projects to monitor' });
    }

    // Rotación por día UTC: si el presupuesto no alcanza para todos, la cola
    // empieza en un punto distinto cada día para no dejar siempre los mismos
    // proyectos sin comprobar.
    const offset = Math.floor(Date.now() / DAY_MS) % activeProjects.length;
    const queue = [...activeProjects.slice(offset), ...activeProjects.slice(0, offset)].filter(
      (project) => Boolean(project.domain)
    );

    const deadline = Date.now() + TIME_BUDGET_MS;
    const results: CheckOutcome[] = [];
    let skipped = 0;
    let index = 0;

    while (index < queue.length) {
      if (Date.now() >= deadline) {
        skipped = queue.length - index;
        break;
      }

      const chunk = queue.slice(index, index + CONCURRENCY);
      const outcomes = await Promise.all(chunk.map((project) => checkProject(project)));
      results.push(...outcomes);
      index += chunk.length;
    }

    if (skipped > 0) {
      logger.warn('Uptime cron: presupuesto de tiempo agotado', {
        checked: results.length,
        skipped,
        total: queue.length,
      });
    }

    return NextResponse.json({
      success: true,
      checked: results.length,
      skipped,
      total: queue.length,
      results,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error('Uptime cron error:', error);
    return NextResponse.json({ error: errMsg || 'Cron error' }, { status: 500 });
  }
}

export const GET = withRequestContext(rawGet);
