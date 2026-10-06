import { z } from "zod";
import { assertPublicHostname } from "@/server/intelligence/security/egress-guard";
import { decryptField } from "@/server/lib/field-crypto";
import type { RemediationConnector } from "@/shared/db/schemas/remediation";

export type { RemediationConnector };

/**
 * connectors.ts — Conectores de ejecución del motor de remediación (C-2).
 *
 * Cada conector: valida su config (zod) → ejecuta → verifica. Todo el tráfico
 * pasa por egress-guard. Los secretos llegan CIFRADOS y se descifran en memoria.
 */

export interface ConnectorField {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}

export interface ConnectorDef {
  id: RemediationConnector;
  label: string;
  description: string;
  fields: ConnectorField[];
}

export const CONNECTORS: ConnectorDef[] = [
  {
    id: "cloudflare.purge_cache",
    label: "Cloudflare: purgar caché",
    description: "Limpia toda la caché de la zona (útil tras Deploy o incidentes de contenido).",
    fields: [
      { key: "apiToken", label: "API Token", secret: true },
      { key: "zoneId", label: "Zone ID", placeholder: "abc123…" },
    ],
  },
  {
    id: "wordpress.update_plugin",
    label: "WordPress: actualizar plugin",
    description: "Actualiza un plugin a su última versión vía REST (Application Password).",
    fields: [
      { key: "siteUrl", label: "URL del sitio", placeholder: "https://…" },
      { key: "username", label: "Usuario" },
      { key: "appPassword", label: "Application Password", secret: true },
      { key: "plugin", label: "Slug del plugin", placeholder: "wordfence" },
    ],
  },
  {
    id: "github.create_issue",
    label: "GitHub: crear issue",
    description: "Abre un issue con el plan de remediación para el equipo.",
    fields: [
      { key: "token", label: "Token (repo)", secret: true },
      { key: "owner", label: "Owner" },
      { key: "repo", label: "Repo" },
    ],
  },
  {
    id: "jira.create_issue",
    label: "Jira: crear issue",
    description:
      "Abre un issue en Jira Cloud con el plan de remediación (usa la descripción en formato ADF, obligatorio en la API v3).",
    fields: [
      { key: "siteUrl", label: "URL de Jira", placeholder: "https://acme.atlassian.net" },
      { key: "email", label: "Email de la cuenta Atlassian", placeholder: "soc@acme.com" },
      { key: "apiToken", label: "API token", secret: true },
      { key: "projectKey", label: "Clave del proyecto", placeholder: "SEC" },
      { key: "issueType", label: "Tipo de issue", placeholder: "Task" },
    ],
  },
  {
    id: "linear.create_issue",
    label: "Linear: crear issue",
    description: "Crea un issue en el equipo de Linear vía GraphQL (issueCreate).",
    fields: [
      { key: "apiKey", label: "API key de Linear", secret: true },
      { key: "teamId", label: "ID del equipo (teamId)", placeholder: "e1f2a3b4-…" },
    ],
  },
  {
    id: "http.request",
    label: "HTTP: webhook genérico",
    description: "Llama a cualquier URL (Zapier, Make, n8n) con el payload dado.",
    fields: [
      { key: "url", label: "URL" },
      { key: "method", label: "Método (POST por defecto)", placeholder: "POST" },
      { key: "body", label: "JSON del cuerpo", placeholder: '{"text":"hola"}' },
    ],
  },
];

const baseConfig = z.record(z.string(), z.string().max(4096));

export interface ExecuteResult {
  ok: boolean;
  evidence: Record<string, unknown>;
}

async function fetchJson(url: string, init: RequestInit): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { status: res.status, json };
}

/**
 * Ejecuta un conector con config YA descifrada. Lanza en error.
 */
export async function executeConnector(
  connector: RemediationConnector,
  config: Record<string, string>,
  context: { title: string; steps: string[] }
): Promise<ExecuteResult> {
  const parsed = baseConfig.safeParse(config);
  if (!parsed.success) throw new Error("Configuración del conector inválida");
  const cfg = parsed.data;

  switch (connector) {
    case "cloudflare.purge_cache": {
      const { apiToken, zoneId } = cfg;
      if (!apiToken || !zoneId) throw new Error("Faltan apiToken o zoneId");
      const { status, json } = await fetchJson(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ purge_everything: true }),
      });
      if (status < 200 || status >= 300) throw new Error(`Cloudflare respondió ${status}`);
      return { ok: true, evidence: { status, result: json } };
    }

    case "wordpress.update_plugin": {
      const { siteUrl, username, appPassword, plugin } = cfg;
      if (!siteUrl || !username || !appPassword || !plugin) {
        throw new Error("Faltan siteUrl, username, appPassword o plugin");
      }
      const host = new URL(siteUrl).hostname;
      await assertPublicHostname(host);
      const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
      const base = siteUrl.replace(/\/$/, "");
      // 1. Resolver versión instalada
      const list = await fetchJson(`${base}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin)}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (list.status === 404) throw new Error(`Plugin no encontrado: ${plugin}`);
      if (list.status < 200 || list.status >= 300) throw new Error(`WordPress respondió ${list.status}`);
      // 2. Actualizar
      const upd = await fetchJson(`${base}/wp-json/wp/v2/plugins/${encodeURIComponent(plugin)}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ context: "edit" }),
      });
      // WP actualiza vía endpoint update (algunos hosts requieren POST update):
      if (upd.status < 200 || upd.status >= 300) {
        const upd2 = await fetchJson(`${base}/wp-json/wp/v2/plugins/update`, {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({ slug: plugin }),
        });
        if (upd2.status < 200 || upd2.status >= 300) {
          throw new Error(`WordPress respondió ${upd2.status} al actualizar`);
        }
        return { ok: true, evidence: { plugin, update: upd2.json } };
      }
      return { ok: true, evidence: { plugin, update: upd.json } };
    }

    case "github.create_issue": {
      const { token, owner, repo } = cfg;
      if (!token || !owner || !repo) throw new Error("Faltan token, owner o repo");
      const title = context.title.slice(0, 120);
      const body = `${context.title}\n\n${context.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\n_Generado por StrategicAudit Pro._`;
      const { status, json } = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ title, body }),
      });
      if (status !== 201) throw new Error(`GitHub respondió ${status}`);
      const url = (json as { html_url?: string })?.html_url ?? null;
      return { ok: true, evidence: { issueUrl: url } };
    }

    case "jira.create_issue": {
      const { siteUrl, email, apiToken, projectKey, issueType } = cfg;
      if (!siteUrl || !email || !apiToken || !projectKey) {
        throw new Error("Faltan siteUrl, email, apiToken o projectKey");
      }
      const base = siteUrl.replace(/\/$/, "");
      await assertPublicHostname(new URL(base).hostname);
      const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
      const { status, json } = await fetchJson(`${base}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: context.title.slice(0, 240),
            issuetype: { name: issueType || "Task" },
            description: adfDocument([context.title, ...context.steps]),
          },
        }),
      });
      if (status < 200 || status >= 300) throw new Error(`Jira respondió ${status}`);
      const key = (json as { key?: string } | null)?.key ?? null;
      return {
        ok: true,
        evidence: { issueKey: key, issueUrl: key ? `${base}/browse/${key}` : null },
      };
    }

    case "linear.create_issue": {
      const { apiKey, teamId } = cfg;
      if (!apiKey || !teamId) throw new Error("Faltan apiKey o teamId");
      await assertPublicHostname("api.linear.app");
      const { status, json } = await fetchJson("https://api.linear.app/graphql", {
        method: "POST",
        // Linear usa la API key tal cual en la cabecera Authorization.
        headers: { Authorization: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          query:
            "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }",
          variables: {
            input: {
              teamId,
              title: context.title.slice(0, 240),
              description: context.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
            },
          },
        }),
      });
      if (status < 200 || status >= 300) throw new Error(`Linear respondió ${status}`);
      const issue = (
        json as {
          data?: { issueCreate?: { issue?: { identifier?: string; url?: string } } };
        } | null
      )?.data?.issueCreate?.issue;
      if (!issue) throw new Error("Linear no devolvió el issue creado");
      return {
        ok: true,
        evidence: { identifier: issue.identifier ?? null, issueUrl: issue.url ?? null },
      };
    }

    case "http.request": {
      const { url, method, body } = cfg;
      if (!url) throw new Error("Falta url");
      const parsedUrl = new URL(url);
      await assertPublicHostname(parsedUrl.hostname);
      const { status, json } = await fetchJson(url, {
        method: (method || "POST").toUpperCase(),
        headers: { "Content-Type": "application/json" },
        body: body || "{}",
      });
      if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
      return { ok: true, evidence: { status, response: json } };
    }

    default:
      throw new Error(`Conector desconocido: ${connector satisfies never}`);
  }
}

/**
 * Documento ADF mínimo y válido para `description` de Jira Cloud v3, que no
 * acepta texto plano. Un párrafo por línea del plan de remediación.
 */
export function adfDocument(paragraphs: string[]): Record<string, unknown> {
  const content = paragraphs
    .filter((p) => p.trim().length > 0)
    .map((p) => ({
      type: "paragraph",
      content: [{ type: "text", text: p.slice(0, 3000) }],
    }));
  return {
    type: "doc",
    version: 1,
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

/** Descifra la config almacenada (acepta legacy en claro por migración). */
export function decryptConfig(stored: string | null): Record<string, string> {
  if (!stored) return {};
  try {
    const raw = decryptField(stored);
    const parsed = baseConfig.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}
