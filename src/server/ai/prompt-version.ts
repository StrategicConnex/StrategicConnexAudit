import { createHash } from "node:crypto";
import type { AIMessage } from "./ai-router";

/**
 * prompt-version.ts — Versionado de prompts (Sprint 1, idea #18 del roadmap).
 *
 * Un hash determinista por llamada permite que los evals sean reproducibles:
 * cuando cambie la calidad de un modelo habrá que distinguir "cambió el
 * modelo" de "cambió el prompt". El hash cubre el contenido de los mensajes
 * (system+user+assistant, con sus roles) — NO las tools ni parámetros de
 * muestreo, que son invariantes del task type.
 *
 * Se registra en `ai_usage.prompt_version` por llamada. El job de eval
 * continuo (idea #8, Sprint 4) agrupará por este hash.
 */

/**
 * Hash estable (sha256, 16 hex) del contenido de los mensajes. Dos llamadas
 * con mensajes idénticos comparten versión aunque cambien modelo, temperatura
 * o maxTokens — esa es la semántica de "versión de prompt".
 */
export function promptVersion(messages: AIMessage[]): string {
  return createHash("sha256")
    .update(JSON.stringify(messages.map((m) => [m.role, m.content])))
    .digest("hex")
    .slice(0, 16);
}
