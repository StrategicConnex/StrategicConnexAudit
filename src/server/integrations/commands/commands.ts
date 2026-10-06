/**
 * commands.ts — Comandos del bot (Tanda 4 / B16).
 *
 * Módulo PURO: parsea el texto que llega de Slack/Teams y formatea la
 * respuesta. No toca BD ni red, así que se prueba sin mocks y el mismo
 * comportamiento sirve para ambos proveedores.
 *
 * Honestidad: `scan` está reconocido por el parser pero todavía NO ejecuta un
 * escaneo (eso vive en el panel o en POST /api/public/v1/intelligence); el bot
 * lo dice explícitamente en vez de fingir que lo ha lanzado.
 */

export const SCAUDIT_COMMANDS = ["help", "status", "ack", "scan"] as const;
export type ScAuditCommandName = (typeof SCAUDIT_COMMANDS)[number];

export interface ParsedCommand {
  name: ScAuditCommandName;
  args: string[];
  /** Texto original normalizado (para logs y eco). */
  raw: string;
}

export type ParseResult =
  | { ok: true; command: ParsedCommand }
  | { ok: false; error: string };

const COMMAND_ALIASES: Record<string, ScAuditCommandName> = {
  help: "help",
  ayuda: "help",
  "?": "help",
  status: "status",
  estado: "status",
  ack: "ack",
  reconocer: "ack",
  scan: "scan",
  escanear: "scan",
};

/** Quita el prefijo del bot: `/scaudit status x` y `@SCAudit status x` son válidos. */
const BOT_PREFIX = /^(\/scaudit|@scaudit|scaudit)\b[\s,:-]*/i;

export function parseCommandText(input: string): ParseResult {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { ok: false, error: "Falta el comando. Prueba con `help`." };
  }

  const body = raw.replace(BOT_PREFIX, "").trim();
  const tokens = body.split(/\s+/).filter(Boolean);
  const first = tokens[0];
  if (!first) {
    return { ok: false, error: "Falta el comando. Prueba con `help`." };
  }

  const name = COMMAND_ALIASES[first.toLowerCase()];
  if (!name) {
    return { ok: false, error: `Comando desconocido: \`${first}\`. Prueba con \`help\`.` };
  }

  return { ok: true, command: { name, args: tokens.slice(1), raw } };
}

// ─── Respuestas ─────────────────────────────────────────────────────────────

export interface SlackAction {
  text: string;
  /** Valor que Slack devuelve en el payload interactivo. */
  value: string;
}

export interface CommandResponse {
  /** Texto (mrkdwn) que muestran Slack y Teams. */
  text: string;
  /** true = el comando no pudo completarse (Slack lo muestra efímero). */
  error: boolean;
  /** Botones opcionales (solo Slack). */
  actions?: SlackAction[];
}

export const HELP_TEXT = [
  "*Comandos de SCAUDIT*",
  "• `status <projectId>` — postura del proyecto: hallazgos abiertos por severidad y último escaneo.",
  "• `ack <findingId>` — acusa recibo del hallazgo y arranca su reloj de SLA.",
  "• `help` — esta ayuda.",
  "• `scan <objetivo>` — *pendiente*: lanza escaneos desde el panel o con la API pública v1.",
].join("\n");

export function formatError(message: string): CommandResponse {
  return { text: `⚠️ ${message}`, error: true };
}

export function formatHelp(): CommandResponse {
  return { text: HELP_TEXT, error: false };
}

export function formatScanPending(target: string | null): CommandResponse {
  return {
    text:
      (target ? `El escaneo de \`${target}\` todavía no se lanza desde el bot.` : "El escaneo todavía no se lanza desde el bot.") +
      " Ejecútalo en el panel o con `POST /api/public/v1/intelligence` (scope `intelligence:write`). No se ha lanzado nada.",
    error: true,
  };
}

export interface OpenFindingSummary {
  id: string;
  severity: string;
  title: string;
}

export interface ProjectStatusView {
  projectName: string;
  domain: string | null;
  /** Total de hallazgos abiertos (no suprimidos). */
  openCount: number;
  bySeverity: Record<string, number>;
  /** 5 más recientes, para los botones de acuse. */
  recent: OpenFindingSummary[];
  /** ISO del último escaneo completado; null si no hay datos. */
  lastAuditAt: string | null;
}

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"] as const;

export function formatStatus(view: ProjectStatusView): CommandResponse {
  const lines: string[] = [];
  lines.push(`*${view.projectName}*${view.domain ? ` — ${view.domain}` : ""}`);

  if (view.openCount === 0) {
    // "0" aquí SÍ es un dato: se ha consultado y no hay hallazgos abiertos.
    lines.push("Hallazgos abiertos: 0");
  } else {
    const breakdown = SEVERITY_ORDER.filter((s) => (view.bySeverity[s] ?? 0) > 0)
      .map((s) => `${view.bySeverity[s]} ${s}`)
      .join(", ");
    lines.push(`Hallazgos abiertos: ${view.openCount}${breakdown ? ` (${breakdown})` : ""}`);
  }

  lines.push(
    view.lastAuditAt
      ? `Último escaneo completado: ${view.lastAuditAt}`
      : "Último escaneo completado: sin datos",
  );

  if (view.recent.length > 0) {
    lines.push("");
    lines.push("_Más recientes (acusa recibo con el botón o `ack <id>`):_");
    for (const f of view.recent) {
      lines.push(`• \`${f.severity}\` ${f.title} — \`${f.id}\``);
    }
  }

  return {
    text: lines.join("\n"),
    error: false,
    actions: view.recent.slice(0, 5).map((f) => ({
      text: `Acusar ${shortId(f.id)}`,
      value: f.id,
    })),
  };
}

export function formatAckResult(input: {
  findingId: string;
  status: string;
  dueAt: string | null;
}): CommandResponse {
  return {
    text: [
      `✅ Hallazgo \`${shortId(input.findingId)}\` acusado (estado: \`${input.status}\`).`,
      input.dueAt ? `SLA hasta: ${input.dueAt}` : "Sin SLA asignado.",
    ].join("\n"),
    error: false,
  };
}

export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Bloques de Slack: texto + un botón por acción (máx. 5 secciones). */
export function buildSlackBlocks(response: CommandResponse): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    { type: "section", text: { type: "mrkdwn", text: response.text } },
  ];
  for (const action of response.actions ?? []) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "scaudit_ack",
          text: { type: "plain_text", text: action.text.slice(0, 75) },
          value: action.value,
        },
      ],
    });
  }
  return blocks;
}
