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

   Última revisión del recuento: 2026-10-11, tras la decisión del operador
   sobre D1-2 y el alcance (barrido por patrón 158 + regla project-scoped 4430;
   auditor read-only con `readOnlyEnforced=true`).
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
  // `project_members`) y que el alta legítima es `pnpm setup-admin`, no el
  // seed. Marcarla DELETE (antes REVIEW) es lo que evita que quede fuera del
  // allowlist de purga y que la Fase 1 cierre con un REVIEW decidido por el
  // operador pero nunca ejecutado.
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
];

/** Excepciones que NUNCA se reportan como hallazgo ni se borran (operativas). */
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

/**
 * Cierre de la regla «project-scoped»: tablas cuyas filas **sólo** se alcanzan
 * porque cuelgan de una fila candidata por una FK de UNA columna con
 * `ON DELETE CASCADE` (hijo del padre candidato: `ab_test_results` del
 * `ab_tests`, `rank_history` del `keyword_targets`, `dns_history` de la
 * `intelligence_investigations`…).
 *
 * Por qué se enumeran en vez de dejar que la cascada las arrastre: sin esto
 * desaparecían en silencio y **fuera del snapshot** (no restaurables), y el
 * gate de dependencias las reportaba como ampliación de alcance no declarada.
 * Un hijo por CASCADE de una fila candidata no tiene identidad propia sin el
 * padre, así que su borrado es la misma decisión, pero ahora es explícito,
 * contado y respaldado.
 *
 * `dns_history` no figura aquí porque ya está en la regla directa: sus 2 filas
 * de cierre se suman a las 19 directas (21 en el recuento).
 */
export const PROJECT_SCOPED_CASCADE_TABLES = new Set([
  "ab_test_results",
  "backlink_history",
  "competitor_keywords",
  "developer_api_keys",
  "integration_sync_logs",
  "rank_history",
  "report_exports",
]);

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
  "projects",
  "project_members",
  "audits",
  // SEO
  "competitors",
  "competitor_keywords",
  "keyword_targets",
  "rank_history",
  "backlinks",
  "backlink_history",
  "internal_links",
  // experimentos
  "ab_tests",
  "ab_test_results",
  // integraciones y sus datos por proveedor
  "integrations",
  "integration_data",
  "integration_data_bing",
  "integration_data_gsc",
  "integration_data_ga4",
  // histórico de dominio
  "whois_history",
  "dns_history",
  // inteligencia (el grueso de los hallazgos: 24 + 47 + 8 + 1)
  "intelligence_investigations",
  "intelligence_findings",
  "intelligence_tool_runs",
  "intelligence_run_events",
  // telemetría y auditoría que escribieron los flujos de prueba
  "security_audit_logs",
  "user_logs",
  "schema_validations",
  "performance_results",
  "crawl_results",
  "heatmap_sessions",
  "issues",
  // escenarios simulados
  "adversary_assessments",
  "scenario_runs",
  // identidades (KEEP protege al usuario del smoke; ver blockers de cascada)
  "users",
]);

/**
 * Recuento de candidatos del **barrido por patrón** que la purga debe cuadrar.
 * Sólo contiene tablas de `PURGE_TABLES`: una tabla fuera del allowlist no
 * puede producir candidatos por patrón, y declararla aquí es un error de
 * configuración que la purga rechaza al arrancar (mejor un fallo ruidoso que un
 * `⚠️` que se ignora). `uptime_logs` está fuera por eso: su basura se cuenta en
 * `PURGE_EXPECTED_PROJECT_SCOPED`, que es quien la puede borrar.
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
  projects: 9,
  schema_validations: 1,
  security_audit_logs: 16,
  user_logs: 14,
  users: 14,
  whois_history: 2,
};

export const PURGE_EXPECTED_TOTAL = Object.values(PURGE_EXPECTED).reduce((a, b) => a + b, 0); // 158

/**
 * REGLA «PROJECT-SCOPED» (decisión del operador, 2026-10-11).
 *
 * Hay filas que pertenecen a un proyecto pero no llevan ningún patrón de texto
 * propio (`uptime_logs`, `audit_logs`, `reports`, `intelligence_usage_events`…),
 * así que un barrido por patrones las deja atrás y —peor— deja al `DELETE` del
 * proyecto retenido por una FK `NO ACTION`. La regla: **toda tabla con una FK de
 * una columna llamada `project_id` hacia `projects` se purga con el proyecto**,
 * y sólo para proyectos candidatos (nunca para un proyecto real).
 *
 * El conjunto va DECLARADO aquí y la purga comprueba que coincide con el que
 * descubre en la BD: si alguien añade una tabla con `project_id`, aparece como
 * diferencia y el `--apply` se rechaza hasta que se declare a conciencia.
 */
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
  "project_members",
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
 * Filas project-scoped medidas el 2026-10-11 (9 proyectos candidatos), con la
 * regla directa (`project_id`) **más** el cierre por CASCADE. Es el recuento que
 * la purga debe cuadrar: `dns_history` = 19 directas + 2 de cierre; y las 7
 * tablas de `PROJECT_SCOPED_CASCADE_TABLES` (3 de ellas en
 * `developer_api_keys`, la clave del usuario de prueba).
 */
export const PURGE_EXPECTED_PROJECT_SCOPED = {
  ab_test_results: 1,
  ab_tests: 1,
  adversary_runs: 2,
  audit_logs: 1,
  audits: 2,
  backlinks: 1,
  backlink_history: 1,
  competitor_keywords: 1,
  competitors: 1,
  developer_api_keys: 3,
  dns_history: 21,
  heatmap_sessions: 1,
  integration_data_bing: 1,
  integration_data_ga4: 1,
  integration_data_gsc: 1,
  integration_sync_logs: 1,
  integrations: 2,
  intelligence_assets: 1,
  intelligence_findings: 21,
  intelligence_investigations: 1,
  intelligence_tool_runs: 34,
  intelligence_usage_events: 34,
  issues: 1,
  keyword_targets: 2,
  monitoring_schedules: 1,
  project_audit_rules: 2,
  rank_history: 1,
  report_exports: 1,
  reports: 1,
  schema_validations: 1,
  subscriptions: 1,
  uptime_logs: 4285,
  whois_history: 1,
};

/**
 * Relaciones de cascada que son PERTENENCIAS de la fila candidata (sus claves,
 * sus logs, sus notificaciones): borrarlas con ella es lo correcto y se aceptan
 * registrándolas. Cualquier otra cascada sobre filas no candidatas bloquea.
 */
export const CASCADE_ACCEPTED = [
  { parent: "users", child: "developer_api_keys" },
  { parent: "users", child: "user_logs" },
  { parent: "users", child: "notifications" },
  { parent: "users", child: "push_subscriptions" },
  { parent: "users", child: "plugin_instances" },
  { parent: "users", child: "project_members" },
];
