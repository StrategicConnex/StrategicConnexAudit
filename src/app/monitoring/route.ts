/**
 * src/app/monitoring/route.ts — túnel de Sentry.
 *
 * `next.config.ts` declara `tunnelRoute: "/monitoring"`, así que el SDK del
 * navegador postea sus envelopes a esta ruta en vez de ir directo a
 * sentry.io. Sin este handler la ruta da 404 y **los errores de cliente se
 * pierden** (los de servidor no pasan por aquí).
 *
 * Por qué no usamos `client.getTransport().send()`: en @sentry/nextjs v11 ese
 * método espera un objeto envelope con `envelopeItems` iterable, no el string
 * serializado que llega del navegador (`envelopeItems is not iterable`).
 * El relay directo al endpoint es explícito y no depende de esa API interna.
 *
 * SEGURIDAD — la ruta es pública (no está en la lista de rutas protegidas del
 * middleware), así que no es un relay abierto: valida que el cuerpo sea
 * realmente un envelope de Sentry, limita el tamaño y nunca reenvía basura.
 * Eso también evita que alguien la use para agotar nuestra cuota gratuita.
 */

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { withRequestContext } from "@/lib/request-context";

export const dynamic = "force-dynamic";

/** Los envelopes de sesión/replay pueden ser grandes; 1 MB es holgado. */
const MAX_ENVELOPE_BYTES = 1024 * 1024;

/** Deriva la URL del endpoint de envelopes y la clave pública del DSN. */
function parseDsn(dsn: string): { endpoint: string; publicKey: string } | null {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, publicKey, host, project] = match;
  // `noUncheckedIndexedAccess`: los grupos del regex son `string | undefined`.
  if (!publicKey || !host || !project) return null;
  return {
    publicKey,
    endpoint: `https://${host}/api/${project}/envelope/`,
  };
}

/**
 * El envelope es un texto con un ítem JSON por línea; la primera es la cabecera
 * y debe traer `event_id`. Sin esa comprobación, un POST con cualquier cuerpo
 * se reenviaría a Sentry.
 */
function isSentryEnvelope(text: string): boolean {
  const firstLine = text.split("\n", 1)[0]?.trim();
  if (!firstLine) return false;
  try {
    const header = JSON.parse(firstLine) as { event_id?: unknown };
    return typeof header.event_id === "string" && header.event_id.length > 0;
  } catch {
    return false;
  }
}

async function rawPost(req: NextRequest) {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return NextResponse.json(
      { success: false, error: "Sentry no configurado" },
      { status: 503 },
    );
  }

  const parsed = parseDsn(dsn);
  if (!parsed) {
    logger.error("DSN de Sentry con formato inválido", { module: "sentry/tunnel" });
    return NextResponse.json(
      { success: false, error: "DSN inválido" },
      { status: 500 },
    );
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json(
      { success: false, error: "Cuerpo ilegible" },
      { status: 400 },
    );
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json(
      { success: false, error: "Cuerpo vacío" },
      { status: 400 },
    );
  }

  if (buffer.byteLength > MAX_ENVELOPE_BYTES) {
    return NextResponse.json(
      { success: false, error: "Envelope demasiado grande" },
      { status: 413 },
    );
  }

  const envelope = new TextDecoder().decode(buffer);
  if (!isSentryEnvelope(envelope)) {
    // No es un envelope: se descarta sin reenviar (ni consumir cuota).
    return NextResponse.json(
      { success: false, error: "Envelope inválido" },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=scaudit-tunnel/1.0, sentry_key=${parsed.publicKey}`,
      },
      body: envelope,
    });

    if (!upstream.ok) {
      logger.warn("Sentry rechazó el envelope del túnel", {
        module: "sentry/tunnel",
        status: upstream.status,
      });
      return NextResponse.json(
        { success: false, error: "Sentry rechazó el envelope" },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    // Fail-open: un fallo del túnel nunca debe romper la app del cliente.
    logger.warn("Fallo al enviar el envelope por el túnel", {
      module: "sentry/tunnel",
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { success: false, error: "Túnel no disponible" },
      { status: 502 },
    );
  }
}

export const POST = withRequestContext(rawPost);
