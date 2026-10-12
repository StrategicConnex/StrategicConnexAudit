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

/** Deriva endpoint, clave pública y destino (host+proyecto) del DSN. */
function parseDsn(dsn: string): {
  endpoint: string;
  publicKey: string;
  host: string;
  project: string;
} | null {
  const match = dsn.match(/^https:\/\/([^@]+)@([^/]+)\/(.+)$/);
  if (!match) return null;
  const [, publicKey, host, project] = match;
  // `noUncheckedIndexedAccess`: los grupos del regex son `string | undefined`.
  if (!publicKey || !host || !project) return null;
  return {
    publicKey,
    host,
    project,
    endpoint: `https://${host}/api/${project}/envelope/`,
  };
}

/**
 * Tipos de ítem que envía el SDK de Sentry (v11). La lista se usa para avisar
 * de tipos nuevos, NO para descartarlos (ver `validarEnvelope`).
 */
const TIPOS_CONOCIDOS = new Set([
  "event",
  "session",
  "sessions",
  "transaction",
  "span",
  "attachment",
  "user_report",
  "profile",
  "profile_chunk",
  "replay_event",
  "replay_recording",
  "client_report",
  "check_in",
  "raw_security",
  "feedback",
]);

type ValidacionEnvelope =
  | { ok: true; tipoDesconocido?: string }
  | { ok: false; motivo: string };

/**
 * Valida que el cuerpo sea un envelope real de Sentry y que vaya dirigido al
 * MISMO proyecto que el DSN configurado (anti open-relay y anti quema de la
 * cuota de un tercero).
 *
 * ── Por qué NO se exige `event_id` (bug corregido el 2026-10-11) ──
 * La versión anterior sólo aceptaba envelopes cuya cabecera trajese
 * `event_id`. Los envelopes de **sesión** (release health) y de
 * **traza/performance** no lo llevan: la ruta les devolvía 400, así que Sentry
 * nunca recibía esos datos y el navegador registraba dos errores de consola en
 * cada carga de `/login` (además rompía el E2E `app.spec.ts:120`).
 *
 * Formato de un envelope: línea 1 = cabecera (con `dsn` y `sent_at`); después
 * pares descriptor/payload. Un descriptor es un JSON con `type`.
 *
 * Política de tipos: se exige que exista al menos un ítem con `type` string,
 * pero un tipo no listado se **reenvía igual** con un aviso en el log. Rechazar
 * lo desconocido reintroduciría el mismo fallo en cuanto el SDK añada un tipo.
 */
function validarEnvelope(
  text: string,
  dsnConfigurado: { host: string; project: string },
): ValidacionEnvelope {
  const lineas = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lineas.length < 2) {
    return { ok: false, motivo: "el envelope no tiene cabecera e ítems" };
  }

  let cabecera: { dsn?: unknown };
  try {
    cabecera = JSON.parse(lineas[0]!) as { dsn?: unknown };
  } catch {
    return { ok: false, motivo: "la cabecera del envelope no es JSON" };
  }
  if (typeof cabecera.dsn !== "string" || !cabecera.dsn) {
    return { ok: false, motivo: "la cabecera no trae dsn" };
  }

  const dsnItem = parseDsn(cabecera.dsn);
  if (!dsnItem) {
    return { ok: false, motivo: "el dsn del envelope tiene formato inválido" };
  }
  if (dsnItem.host !== dsnConfigurado.host || dsnItem.project !== dsnConfigurado.project) {
    return { ok: false, motivo: "el dsn del envelope no corresponde al proyecto configurado" };
  }

  let items = 0;
  let tipoDesconocido: string | undefined;
  for (let i = 1; i < lineas.length; i++) {
    let item: { type?: unknown } | null = null;
    try {
      item = JSON.parse(lineas[i]!) as { type?: unknown };
    } catch {
      item = null; // payload no-JSON (p. ej. minidump): se ignora
    }
    if (!item || typeof item.type !== "string" || !item.type) continue;
    items++;
    if (!TIPOS_CONOCIDOS.has(item.type) && tipoDesconocido === undefined) {
      tipoDesconocido = item.type;
    }
  }
  if (items === 0) {
    return { ok: false, motivo: "el envelope no contiene ningún ítem con type" };
  }

  return tipoDesconocido === undefined ? { ok: true } : { ok: true, tipoDesconocido };
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
  const validacion = validarEnvelope(envelope, parsed);
  if (!validacion.ok) {
    // No es un envelope nuestro: se descarta sin reenviar (ni consumir cuota).
    logger.warn("Envelope de Sentry descartado por la validación", {
      module: "sentry/tunnel",
      motivo: validacion.motivo,
    });
    return NextResponse.json(
      { success: false, error: `Envelope inválido: ${validacion.motivo}` },
      { status: 400 },
    );
  }
  if (validacion.tipoDesconocido) {
    logger.warn("Envelope con tipo de ítem no listado; se reenvía igual", {
      module: "sentry/tunnel",
      type: validacion.tipoDesconocido,
    });
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
