/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Fuente ÚNICA de la política de datos falsos.

   Antes estos patrones vivían duplicados en el auditor y en la spec de la
   purga del plan. Duplicarlos ya nos costó una clase entera de bugs (el mismo
   fix de SSL copiado en tres scripts), así que aquí hay un solo sitio para:

     · PATTERNS               → qué texto delata una fila inventada.
     · DEMO_PROJECT_PATTERNS  → qué convierte un proyecto en "demo".
     · PROJECT_SCOPED         → filas sin patrón propio, atribuibles por FK.
     · KEEP                   → excepciones operativas (NUNCA se tocan).
     · PURGE_TABLES           → dónde SÍ se permite borrar.
     · PURGE_EXPECTED         → recuento por tabla que la purga debe cuadrar.

   Lo consume `scripts/db/fake-data-audit.mjs` (que informa) y
   `scripts/db/fake-data-purge.mjs` (que borra). Si cambias algo aquí, vuelve
   a correr el auditor y actualiza PURGE_EXPECTED con lo que diga — nunca al
   revés.

   Última revisión del recuento: 2026-10-11 (auditoría read-only, DELETE=155,
   REVIEW=0, 76 tablas escaneadas, `readOnlyEnforced=true`).
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Patrones globales: se aplican a TODAS las tablas de `public`.
 * D1-1 (2026-10-10): el proyecto `Pipeline Test - strategicconnex.com.ar` pasó
 * de REVIEW a DELETE por decisión del operador.
 * D1-2 (2026-10-11): `admin@strategicaudit.pro` pasó de REVIEW a DELETE por la
 * misma vía (ver el patrón `ambiguous-admin`).
 */
export const PATTERNS = [
  { id: "demo-domain", kind: "DELETE", find: ["example.com", "example.org", "example.net"] },
  { id: "seed-fake-email", kind: "DELETE", find: ["client@company.com", "usera_", "userb_"] },
  { id: "fake-registrar", kind: "DELETE", find: ["ICANN Registrar Corp"] },
  { id: "fake-ip-testnet", kind: "DELETE", find: ["203.0.113."] },
  { id: "sim-marker", kind: "DELETE", find: ["[SIM]"] },
  { id: "fake-cohosted", kind: "DELETE", find: ["site1.", ".domain.net"] },
  { id: "seed-competitor", kind: "DELETE", find: ["competitor1.com"] },
  { id: "seed-pipeline", kind: "DELETE", find: ["pipeline test"] },
  // D1-2 (2026-10-11): el operador confirmó que es una identidad de login de
  // PRUEBA (fila del seed: mismo segundo que `client@company.com`, 0 filas en
  // `project_members`) y que el alta legítima es `pnpm setup-admin`, no el
  // seed. Marcarla DELETE (antes REVIEW) es lo que evita que quede fuera del
  // allowlist de purga y que la Fase 1 cierre con un REVIEW decidido por el
  // operador pero nunca ejecutado.
  //
  // ⚠️ PENDIENTE DE REVISIÓN (2026-10-11, evidencia nueva): esta fila es
  // `owner_id` de 5 proyectos (`hola`/pepe.com.ar, `runrun`,
  // `strategic connex`/vercel, `Strategic Connex COM AR`/strategicconnex.com.ar
  // y `Main E-commerce`), es decir **4 proyectos que no parecen de prueba**.
  // `projects.owner_id` es ON DELETE CASCADE, así que borrar la fila se lleva
  // los proyectos: la purga lo trata como BLOCKER y no la borra. Ver el plan.
  { id: "ambiguous-admin", kind: "DELETE", find: ["admin@strategicaudit.pro"] },
];

/** Excepciones que NUNCA se reportan como hallazgo ni se borran (operativas). */
export const KEEP = ["smoke-test@strategicconnex.test"];

/** Patrones que identifican un "proyecto demo", destino de la purga. */
export const DEMO_PROJECT_PATTERNS = ["example.com", "example.org", "example.net", "pipeline test"];

/**
 * Tablas cuyas filas no tienen patrón de texto propio y sólo se pueden atribuir
 * a un proyecto demo por su FK. El auditor las reporta como DELETE con el
 * patrón sintético `DELETE:demo-project-fk`.
 *
 * `exec_briefs` (D1-3) está aquí como RED DE SEGURIDAD, no como instrucción de
 * borrado: sus 4 filas actuales cuelgan del proyecto real `Consultora BPOMA` y
 * no se tocan. Como `exec_briefs.project_id` es ON DELETE CASCADE, las de un
 * proyecto demo desaparecen al borrar el proyecto.
 */
export const PROJECT_SCOPED = { exec_briefs: "project_id" };

/**
 * Tablas donde SÍ se permite borrar. **AMPLIADA el 2026-10-11** con los
 * hallazgos reales del auditor: la lista original cubría 18 tablas y dejaba
 * fuera el grueso de la basura (los `intelligence_*`, los logs y los históricos
 * de dominio), así que la purga habría terminado en `DELETE>0` perpetuo.
 * Todo lo que no esté aquí se informa como REVIEW y no se toca.
 *
 * `exec_briefs` queda FUERA a propósito (D1-3): sus filas son de un proyecto
 * real y las de un proyecto demo las retira el CASCADE.
 */
export const PURGE_TABLES = new Set([
  // núcleo
  "projects", "project_members", "audits",
  // SEO
  "competitors", "competitor_keywords", "keyword_targets", "rank_history",
  "backlinks", "backlink_history", "internal_links",
  // experimentos
  "ab_tests", "ab_test_results",
  // integraciones y sus datos por proveedor
  "integrations", "integration_data", "integration_data_bing",
  "integration_data_gsc", "integration_data_ga4",
  // histórico de dominio
  "whois_history", "dns_history",
  // inteligencia (el grueso de los hallazgos: 24 + 47 + 8 + 1)
  "intelligence_investigations", "intelligence_findings",
  "intelligence_tool_runs", "intelligence_run_events",
  // telemetría y auditoría que escribieron los flujos de prueba
  "security_audit_logs", "user_logs", "schema_validations",
  "performance_results", "crawl_results", "heatmap_sessions", "issues",
  // escenarios simulados
  "adversary_assessments", "scenario_runs",
  // identidades (KEEP protege al usuario del smoke; ver blockers de cascada)
  "users",
]);

/**
 * Recuento de candidatos por tabla que la purga debe cuadrar.
 * Fuente: auditoría read-only del 2026-10-11 (línea base en
 * `backups/fake-data-baseline-2026-10-11.json`, ignorado por git).
 * Si un dry-run se desvía >5% de esto, se investiga ANTES de aplicar.
 */
export const PURGE_EXPECTED = {
  ab_tests: 1,
  backlinks: 1,
  competitors: 1,
  crawl_results: 2,
  dns_history: 11,
  heatmap_sessions: 1,
  integration_data_bing: 1,
  integration_data_gsc: 1,
  intelligence_findings: 24,
  intelligence_investigations: 8,
  intelligence_run_events: 1,
  intelligence_tool_runs: 47,
  internal_links: 1,
  issues: 1,
  performance_results: 1,
  projects: 6,
  schema_validations: 1,
  security_audit_logs: 16,
  user_logs: 14,
  users: 14,
  whois_history: 2,
};

export const PURGE_EXPECTED_TOTAL = Object.values(PURGE_EXPECTED).reduce((a, b) => a + b, 0); // 155
