/**
 * Parser local de comandos slash del chat de Intelligence.
 *
 * Se resuelve en el cliente antes de cualquier fetch: `/help` y los comandos
 * desconocidos nunca llaman al modelo. `/finding` solo transporta el ID; el
 * servidor vuelve a autorizarlo bajo RLS.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export type ChatCommand =
  | { kind: "help" }
  | { kind: "finding"; findingId: string | null; argument: string }
  | { kind: "unknown"; command: string };

/**
 * Devuelve `null` cuando el texto no es un comando (flujo normal de chat).
 * El nombre del comando es case-insensitive; el ID debe ser un UUID.
 */
export function parseChatCommand(input: string): ChatCommand | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;

  const [rawName = "", ...rest] = text.slice(1).split(/\s+/);
  const name = rawName.toLowerCase();

  if (name === "help") return { kind: "help" };

  if (name === "finding") {
    const argument = rest[0] ?? "";
    return {
      kind: "finding",
      findingId: isUuid(argument) ? argument : null,
      argument,
    };
  }

  return { kind: "unknown", command: `/${rawName}` };
}
