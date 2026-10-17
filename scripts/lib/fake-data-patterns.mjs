/* ═══════════════════════════════════════════════════════════════════════
   SCAUDIT — Fuente ÚNICA de la política de datos falsos.

   Antes estos patrones vivían duplicados en el auditor y en la spec de la
   purga del plan. Duplicarlos ya nos costó una clase entera de bugs (el mismo
   fix de SSL copiado en tres scripts), así que aquí hay un solo sitio para:

     · PATTERNS                       → qué texto delata una fila inventada.
     · DEMO_PROJECT_PATTERNS          → qué convierte un proyecto en "demo".
     · PROJECT_SCOPED_TABLES/FK       → filas sin patrón propio, atribuibles
                                        por su `project_id` (regla directa).
     · PROJECT_SCOPED_CASCADE_TABLES  → hijas de una fila candidata por FK
                                        `ON DELETE CASCADE` (regla de cierre).
     · KEEP                           → excepciones operativas (NUNCA se tocan).
     · PURGE_TABLES                   → dónde SÍ se permite borrar por patrón.
     · PURGE_EXPECTED                 → recuento del barrido por patrón.
     · PURGE_EXPECTED_PROJECT_SCOPED  → recuento de la regla project-scoped.

   Lo consume `scripts/db/fake-data-audit.mjs` (que informa) y
   `scripts/db/fake-data-purge.mjs` (que borra). Si cambias algo aquí, vuelve
   a correr el auditor y actualiza los recuentos con lo que diga — nunca al
   revés.

   Última revisión del recuento: 2026-10-12 (P0.5), tras la decisión del
   operador sobre los proyectos placeholder y los usuarios sintéticos
   (ver `PLACEHOLDER_PROJECT_NAMES` y el patrón `synthetic-user`).
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
  // D4 (2026-10-11, decisión del operador): los 4 proyectos de los scripts de
  // RLS (`test-rls.ts`, `rls-fire-test.ts`) se crean 73 ms después de su usuario
  // de prueba y llevan el nombre plantilla "Proyecto Secreto de A" sobre
  // `secreto-a.com`: son fixtures, no clientes.
  { id: "seed-rls-fixture", kind: "DELETE", find: ["proyecto secreto de a", "secreto-a.com"] },
  // D1-2 (2026-10-11): el operador confirmó que es una identidad de login de
  // PRUEBA (fila del seed: mismo segundo que `client@company.com`, 0 filas en
  // `project_members` antes de que se eliminara en 0052) y que el alta
  // legítima es `pnpm setup-admin`, no el seed. Marcarla DELETE (antes REVIEW)
  // es lo que evita que quede fuera del allowlist de purga y que la Fase 1
  // cierre con un REVIEW decidido por el operador pero nunca ejecutado.
  //
  // ⚠️ RESUELTO (2026-10-11): esta fila era `owner_id` de 4 proyectos reales
  // (`hola`/pepe.com.ar, `runrun`, `strategic connex`/vercel,
  // `Strategic Connex COM AR`/strategicconnex.com.ar), así que
  // `projects.owner_id ON DELETE CASCADE` los habría borrado «con éxito».
  // ANTES de purgar, la propiedad se traspasó al admin real
  // (`pnpm setup-admin`, 0 proyectos del seed): la cuenta original ya sólo
  // posee el proyecto demo y el gate de dependencias ya no ve proyectos
  // ajenos colgando de esta fila. El traspaso está registrado en el plan.
  { id: "ambiguous-admin", kind: "DELETE", find: ["admin@strategicaudit.pro"] },
  // P0.5 (2026-10-12, decisión del operador): identidades de login SINTÉTICAS.
  //   · `dev@localhost.dev` — cuenta del bypass de desarrollo
  //     (`src/shared/lib/auth.ts`, `NEXT_PUBLIC_DEV_BYPASS_AUTH`); su id es
  //     `00000000-…-0001`, tiene 0 proyectos y NO existe en `auth.users`.
  //   · `e2e.rls.*` — fixture del E2E de RLS (`scripts/e2e/post-rls-check.mjs`),
  //     0 proyectos.
  // `smoke-test@strategicconnex.test` NO entra: es la credencial operativa del
  // gate de smoke y vive en `KEEP`.
  { id: "synthetic-user", kind: "DELETE", find: ["dev@localhost.dev", "e2e.rls."] },
];

/** nombres exactos */
export const PLACEHOLDER_PROJECT_NAMES = ["runrun", "strategic connex", "Strategic Connex COM AR"];

/** nunca se borran ni se reportan como hallazgo */
export const KEEP = ["smoke-test@strategicconnex.test"];

/** Patrones que identifican un "proyecto demo", destino de la purga. */
export const DEMO_PROJECT_PATTERNS = [
  "example.com",
  "example.org",
  "example.net",
  "pipeline test",
  "proyecto secreto de a",
  "secreto-a.com",
];

/** Tablas project-scoped: se purgan con el proyecto candidate */
export const PROJECT_SCOPED_FK = "project_id";
export const PROJECT_SCOPED_TABLES = new Set([
  "ab_tests",
  "adversary_assessments",
  "adversary_runs",
  "ai_report_jobs",
  "anomaly_detections",
  "audit_logs",
  "audits",
  "backlinks",
  "competitors",
  "dns_history",
  "domain_technologies",
  "exec_briefs",
  "forecasts",
  "heatmap_sessions",
  "integration_data_bing",
  "integration_data_ga4",
  "integration_data_gsc",
  "integrations",
  "intelligence_assets",
  "intelligence_findings",
  "intelligence_investigations",
  "intelligence_tool_runs",
  "intelligence_usage_events",
  "issues",
  "keyword_targets",
  "mitre_evaluations",
  "monitoring_alerts",
  "monitoring_schedules",
  "notifications",
  "plugin_instances",
  "project_audit_rules",
  "project_invitations",
  "remediation_actions",
  "reports",
  "schema_validations",
  "subscriptions",
  "team_audit_logs",
  "uptime_logs",
  "web_vitals_logs",
  "webhook_configs",
  "whois_history",
]);

/**
 * Hijas que NO tienen `project_id` y se cierran por CASCADA desde su padre.
 *
 * El cierre de alcance del auditor y de la purga (`scripts/db/fake-data-*.mjs`)
 * las consulta: sin esta lista, una cascada legítima se leería como ampliación
 * de alcance no declarada y el `--apply` quedaría bloqueado. Se perdió al
 * recortar `project_members` en P2-16 (f1eecca) mientras los consumidores
 * seguían importándola.
 */
export const PROJECT_SCOPED_CASCADE_TABLES = new Set([
  "ab_test_results",
  "backlink_history",
  "crawl_results",
  "competitor_keywords",
  "developer_api_keys",
  "integration_sync_logs",
  "rank_history",
  "report_exports",
  // P0.5 (drizzle/0043): `intelligence_run_events` cuelga de una investigación
  // por `investigation_id ON DELETE CASCADE`.
  "intelligence_run_events",
]);

/** Tablas donde SÍ se permite borrar por patrón */
export const PURGE_TABLES = new Set([
  "projects",
  "audits",
  "competitors",
  "competitor_keywords",
  "keyword_targets",
  "rank_history",
  "backlinks",
  "backlink_history",
  "internal_links",
  "ab_tests",
  "ab_test_results",
  "integrations",
  "integration_data",
  "integration_data_bing",
  "integration_data_gsc",
  "integration_data_ga4",
  "whois_history",
  "dns_history",
  "intelligence_investigations",
  "intelligence_findings",
  "intelligence_tool_runs",
  "intelligence_run_events",
  "security_audit_logs",
  "user_logs",
  "schema_validations",
  "performance_results",
  "crawl_results",
  "heatmap_sessions",
  "issues",
  "adversary_assessments",
  "scenario_runs",
  "users",
]);

/** Recuento esperado del barrido por patrones (fuente: dry-run de la purga) */
export const PURGE_EXPECTED = {
  projects: 0,
  users: 0,
  user_logs: 0,
};
export const PURGE_EXPECTED_TOTAL = Object.values(PURGE_EXPECTED).reduce((a, b) => a + b, 0); // 0

/** Tablas project-scoped medibles */
export const PURGE_EXPECTED_PROJECT_SCOPED = {
  audits: 0,
  crawl_results: 0,
  issues: 0,
  uptime_logs: 0,
};

/** cascadas aceptadas como pertenencias del padre */
export const CASCADE_ACCEPTED = [
  { parent: "users", child: "developer_api_keys" },
  { parent: "users", child: "user_logs" },
  { parent: "users", child: "notifications" },
  { parent: "users", child: "push_subscriptions" },
  { parent: "users", child: "plugin_instances" },
];
