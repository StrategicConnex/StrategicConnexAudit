import { NextRequest } from 'next/server';
import { createClient } from '@/shared/lib/supabase/server';
import { readPdfProgress, deletePdfProgress } from '@/server/reports/pdf-progress';
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/reports/pdf/progress?genId=<uuid>
 *
 * SSE endpoint that streams PDF generation progress.
 * The POST /api/reports/pdf handler writes progress to the `pdf_progress`
 * table as it works. This endpoint polls it every 600ms and forwards events
 * to the client.
 *
 * SECURITY (VULN-007 fix): requires an active session. The row is keyed by
 * (userId, genId), so a caller can only observe progress of generations they
 * started themselves.
 *
 * Events:
 *   event: progress\ndata: {"percent":N,"step":"..."}\n\n
 *   event: complete\ndata: {"percent":100}\n\n
 *   event: error\ndata: {"error":"..."}\n\n
 */
async function rawGet(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const genId = searchParams.get('genId');

  if (!genId || typeof genId !== 'string' || genId.length < 8) {
    return new Response('Missing or invalid genId', { status: 400 });
  }

  // SSE response headers
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  let closed = false;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const poll = async () => {
        while (!closed) {
          try {
            const raw = await readPdfProgress(user.id, genId);

            if (raw) {
              if (raw.status === 'complete' || raw.percent >= 100) {
                const msg = `event: complete\ndata: ${JSON.stringify({ percent: 100 })}\n\n`;
                controller.enqueue(encoder.encode(msg));
                closed = true;
                controller.close();
                // Clean up progress row
                void deletePdfProgress(user.id, genId);
                return;
              }

              if (raw.status === 'error') {
                const msg = `event: error\ndata: ${JSON.stringify({ error: raw.error || 'Unknown error' })}\n\n`;
                controller.enqueue(encoder.encode(msg));
                closed = true;
                controller.close();
                void deletePdfProgress(user.id, genId);
                return;
              }

              const msg = `event: progress\ndata: ${JSON.stringify({
                percent: raw.percent,
                step: raw.step || 'Processing...',
              })}\n\n`;
              controller.enqueue(encoder.encode(msg));
            } else {
              // No progress yet — send heartbeat
              controller.enqueue(encoder.encode(`: heartbeat\n\n`));
            }
          } catch (err) {
            logger.error('[progress-sse] read error:', err);
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
      };

      poll().catch((err) => {
        logger.error('[progress-sse] Fatal error:', err);
        if (!closed) {
          try {
            const msg = `event: error\ndata: ${JSON.stringify({ error: 'Internal error' })}\n\n`;
            controller.enqueue(encoder.encode(msg));
            controller.close();
          } catch {}
          closed = true;
        }
      });

      // Timeout safety: auto-close after 60s
      setTimeout(() => {
        if (!closed) {
          const msg = `event: timeout\ndata: ${JSON.stringify({ error: 'Generation timed out' })}\n\n`;
          try {
            controller.enqueue(encoder.encode(msg));
            controller.close();
          } catch {}
          closed = true;
          void deletePdfProgress(user.id, genId);
        }
      }, 60_000);
    },

    cancel() {
      closed = true;
    },
  });

  return new Response(stream, { headers });
}

export const GET = withRequestContext(rawGet);
