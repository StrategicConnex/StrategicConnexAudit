# Plan: Eliminar los datos falsos del proyecto (y que no vuelvan a entrar)

**Estado:** `FASE_1_COMPLETADA` (2026-10-11) — **no archivado**: sigue la Fase 2 (cortar la
generación). La purga se ejecutó con orden explícita del operador: backup previo verificado
(8 448,27 KB / 27 672 `INSERT`) → `--apply` (exit 0, **4.515 filas** en una transacción,
snapshot en `backups/`) → auditor `DELETE=0  REVIEW=0`.

- **Fase 0 (medición) — COMPLETA.** Task 1 entregada: `scripts/db/fake-data-audit.mjs`
  (read-only, exit 1 si hay `DELETE`) + script `pnpm db:fake-audit`. Sesión Postgres abierta
  en read-only y salida redactada (PK + columnas coincidentes, nunca la fila completa).
  Task 2 (backup) **ejecutada y verificada el 2026-10-11** (ver Task 2).
- **D1 — CERRADA (2026-10-11).** D1-1 `Pipeline Test` → DELETE · **D1-3 `exec_briefs`
  revertida**: los 4 briefs cuelgan del proyecto real `Consultora BPOMA` y no se borran ·
  **D1-2 resuelta por traspaso**: la fila `admin@strategicaudit.pro` era `owner_id` de 5
  proyectos (4 sin pinta de prueba) con `projects.owner_id ON DELETE CASCADE`, así que la
  propiedad de los 4 reales se traspasó al admin con login **antes** de purgar; verificado
  después que la cuenta original ya sólo posee el proyecto demo. Detalle en *D1-2*.
- **Alcance de la purga definido por el operador (2026-10-11):** además del barrido por
  patrón, la regla «project-scoped» (FK directa `project_id` + cierre por `ON DELETE
  CASCADE`), declarada y auditada contra la BD — es lo que convierte los 1.372 filas
  «aceptadas en bloque» de antes en 4.430 filas enumeradas, contadas y respaldadas.
- **Bug de SSL corregido antes de la Fase 1 (2026-10-11):** `pg@8.20` pisaba el objeto `ssl`
  con el `sslmode` del DSN y `backup-manager.ts` **además invertía el flag**
  `DB_ALLOW_INSECURE_SSL` → política única en `scripts/lib/db-connection.mjs` + guard
  `tests/security/db-connection-ssl.test.ts`. Es lo que desbloqueó la Task 2.
- **Migraciones al día (2026-10-11):** `pnpm db:migrate` aplicó las **5** pendientes
  (`2026-10-05_finding_lifecycle`, `2026-10-05_notifications`, `0039_rls_fase2_fix`,
  `0040_platform_cache_queue`, `0041_platform_idempotency_outbox`) y el ledger quedó en 53/53.
  Tres de ellas ya estaban aplicadas a mano en la BD (sólo faltaba el registro), así que el
  efecto real fue crear las 5 tablas de plataforma. **`db:drift-check` pasa a exit 0**
  («Sin drift duro»); quedan 22 diffs adhesivas.
- **CI fuera de producción (parcial):** el job `api-contract-test` ya no puede apuntar a
  producción (guard `target`: `TEST_ENV` ∈ {staging,test} + `SCAUDIT_CONTRACT_BASE_URL` no
  productivo + colección reapuntable). **Abierto:** el job `e2e` sigue usando el secreto
  `DATABASE_URL` — si ese secreto apunta a producción, el job escribe en producción.
- Fase 1 (purga): **backup hecho** (Task 2), **política ampliada** (regla project-scoped) y
  **script de purga entregado** (Task 3). Tras la decisión del operador sobre D1-2 y el
  alcance, el dry-run del 2026-10-11 **cuadra al 100% y sale limpio (exit 0)**: 158 filas por
  patrón + 4.430 por la regla project-scoped (FK directa + cierre por CASCADE) = **4.515 filas
  a borrar en una transacción**, sin bloqueos de FK ni cascadas fuera de lo declarado. La
  ejecución (Task 4) espera el visto bueno del operador: es una escritura irreversible en la BD.

> **For agentic workers:** REQUIRED SUB-SKILL: `writing-plans` (este documento ya cumple su
> formato; léelo completo antes de ejecutar tareas). Global constraints: ver sección
> **Global Constraints** (son obligatorias, no sugerencias).

**Goal:** Que la aplicación y la base de datos dejen de contener datos inventados — hoy mismo
— y que ningún script, cron, CI ni feature vuelva a escribir datos falsos en el futuro.

**Architecture:** (1) Medir → (2) Purgar lo ya persistido con backup + dry-run → (3) Cortar la
generación en backend (executors, crons, rutas mock, seed) → (4) UI honesta (sin teatro) →
(5) Guardas de proceso (guard estático `pnpm guard:fakedata`, auditor de BD en CI,
`assert-not-prod` en todo script) para que sea **imposible** regresar a este estado.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), TypeScript, Drizzle + Supabase
(Postgres, esquema `public` + `auth`), Vitest, Playwright, `pg` (scripts Node ESM),
GitHub Actions (`.github/workflows/ci.yml`), hooks `.githooks/*`.

---

## Global Constraints

1. **Nunca committear ni pushear sin petición explícita.** Staging explícito de rutas
   (`git add <ruta>`), **nunca** `git add -A`/`git add .`.
2. **No tocar trabajo ajeno sin confirmar.** WIP sin commitear: `dev.pid`, `e2e-err.log`,
   `e2e-run.log`, `opencode.json`, `messages/*.json`, `src/app/page.tsx`, `MetricCard.tsx`,
   **`src/features/dashboard/**`**, `theme-switcher.tsx`, `use-notification-center.ts`,
   `design-tokens.css`, `src/app/api/ai/healthcheck/route.ts`,
   `.agents/skills/end-user-simulation/**`, **`src/components/**`**.
   > ⚠️ Conflicto conocido: las Tareas 14-18 tocan `src/features/dashboard/**`. Antes de cada
   > una de esas tareas ejecuta
   > `git status --porcelain src/features/dashboard src/components` y, si hay cambios sin
   > commitear, **pausa y pide confirmación** al usuario (secuenciar después del commit del
   > WIP o usar un stash explícito acordado).
3. **`.env.local` nunca se commitea** (está en `.gitignore` vía `.env*`). Credenciales del
   smoke y `DATABASE_URL` viven ahí y sólo se leen.
4. **Evidencia antes que afirmaciones.** No reportar DONE sin gates en verde
   (`pnpm lint`, `npx tsc --noEmit`, `pnpm test`, `pnpm build`, auditorías de BD/guardas).
5. **Commits con hooks lentos:** timeout ≥ **420000 ms** en `git commit`.
6. **Docs de arquitectura:** `docs/architecture/*.md` deben pasar
   `node scripts/quality-gate.mjs <file> --min 80` (pre-commit + CI `docs-quality-gate`).
   Este plan vive en `docs/superpowers/plans/` (no lo exige).
7. **No ejecutar ningún borrado en BD sin `--dry-run` previo + backup completo.**

---

## Decisiones asumidas (ajustables — confirmar si no estás de acuerdo)

No bloqueo el arranque; si una es errónea, se corrige antes de su tarea.

- **D1 · Limpieza en prod:** **dry-run + backup completo (`backup-manager`) + confirmación
  explícita del listado** antes de `--apply`. Nunca borrado ciego.
- **D2 · Features de teatro:** **conectar a datos reales cuando la fuente existe**
  (chat → `/api/ai/copilot`, grafo → datos reales) y, cuando no existe fuente,
  **estado honesto vacío/error** (sin simulación y sin salvar con una etiqueta "SIMULADO").
- **D3 · `seed.ts` y scripts:** `src/shared/db/seed.ts` **se elimina**; el resto de scripts que
  escriben en prod pasan a exigir entorno no-productivo vía `assert-not-prod()` + flag
  explícito `--allow-prod`, y los e2e limpian por defecto.

---

### D1-1..D1-3 — ambigüedades de la Fase 1 (resueltas 2026-10-10)

- **D1-1 · `Pipeline Test - strategicconnex.com.ar` → DELETE.** Decisión del operador: se
  confirma como dato de prueba. Pasa de `REVIEW` a `DELETE` en el inventario, en los
  `PATTERNS` del auditor y en los de la purga.
- **D1-2 · `admin@strategicaudit.pro` → DELETE (CONFIRMADO por el operador, 2026-10-11).**
  Es una identidad de login de prueba, no el admin real: el alta legítima del admin es
  `pnpm setup-admin <email>` (`src/scripts/setup-admin.ts`, se conserva y sólo recibe la
  guarda de entorno de la Task 7) y **`seed.ts` se elimina (Task 6)**, así que no puede ser
  su origen en el estado final. El operador lo confirmó el 2026-10-11.
  **Evidencia (auditoría 2026-10-10):** es la única fila `REVIEW`; su `id` es
  `d4e8c1fa-8a5f-4a3e-b2d9-1c9f2a0b3e1a` (patrón escrito a mano, no aleatorio), su
  `full_name` es "Admin User", se creó en el MISMO segundo que `client@company.com`
  ("Client User") y tiene 0 filas en `project_members`. Los admins con pinta real son otros
  (`adm***@strategicconnex.com.ar` y el del smoke).

  **REAPERTURA (2026-10-11, evidencia medida con la BD real):** la premisa de la decisión era
  falsa. `membresías=0` en `project_members` es cierto, **pero la propiedad no vive ahí**:
  `projects.owner_id` apunta a esa fila en **5 proyectos**, de los que **4 no tienen pinta de
  prueba**: `hola` (pepe.com.ar), `runrun` (runrunenergetico.com), `strategic connex`
  (strategicconnex.vercel.app) y `Strategic Connex COM AR` (strategicconnex.com.ar); el quinto
  es `Main E-commerce` (demo). `projects.owner_id` es **`ON DELETE CASCADE`**, así que borrar
  esa fila **se lleva por delante 4-5 proyectos**, no una identidad de prueba. Además no tiene
  identidad en `auth.users` (0 de los 14 candidatos la tienen), así que no hay login que
  retirar: la fila es propiedad, no acceso.

  **RESUELTO (2026-10-11, opción b — traspaso).** El operador eligió reasignar la propiedad: los
  4 proyectos reales (`pepe.com.ar`, `runrun`, `strategicconnex.vercel.app`,
  `strategicconnex.com.ar`) pasaron al admin real con login (`a***@strategicconnex.com.ar`, 0
  proyectos del seed) y quedó registro reversible en
  `backups/d1-2-owner-reassignment-*.json`. Verificado después del traspaso: la cuenta original
  ya sólo posee el proyecto demo, así que `projects.owner_id ON DELETE CASCADE` **no arrastra
  nada ajeno** y la fila se borra como cualquier otro candidato. Sin ese paso, la purga la
  habría reportado como BLOCKER y la Fase 1 no cerraría.

  **OVERRIDE (2026-10-12, P0.5):** el operador revirtió parte de esta decisión.
  3 de los 4 proyectos conservados aquí (`runrun`, `strategic connex`,
  `Strategic Connex COM AR`) se **borraron** en P0.5 (ver la sección «P0.5»);
  el 4º (`hola` / pepe.com.ar) sigue soft-deleted (`is_deleted=true`) y no se tocó.
- **D1-3 · `exec_briefs` (4 filas) → NO SE BORRAN (reversión confirmada, 2026-10-11).** La auditoría
  ejecutada contradice la decisión inicial: las 4 filas cuelgan del proyecto
  **`Consultora BPOMA` (`bpoma.com`)**, que es un proyecto real (2026-05-20, con escaneos
  propios), y son briefs generados de verdad (`is_fallback = false`). Ninguna fila está
  ligada a un proyecto demo, así que ni el auditor las marca ni la purga las tocaría:
  **no se borran.** `exec_briefs` sí figura en la regla project-scoped
  (`PROJECT_SCOPED_TABLES`) como red de seguridad, no como instrucción: sus 4 filas cuelgan de
  un proyecto real y no se seleccionan; las de un proyecto demo entrarían por el `ON DELETE
  CASCADE` ya declarado.
## Inventario base (evidencia 2026-10-06, sondeos `fake-data-audit.cjs` + `cookie-probe.mjs`, sólo SELECT)

**Ya persistido en prod (patrón `qwebfomwtwxxbkxbrrwm`, 21 proyectos / 21 usuarios):**

| Qué | Cuánto | Origen |
|---|---|---|
| Proyectos demo `example.com/.org` | 4 (Main E-commerce, SaaS Landing, E2E RLS Check, Prueba Real Smoke, Proyecto Smoke Mimo ≈ 5) | `seed.ts` + `post-rls-check.mjs` + smoke |
| Proyecto `Pipeline Test - strategicconnex.com.ar` | 1 → **DELETE** (D1-1: confirmado dato de prueba) | scripts pipeline |
| Usuarios falsos | 12 `usera_*/userb_*@test.com` + `client@company.com` | `test-rls.ts`, `rls-fire-test.ts`, seed |
| `admin@strategicaudit.pro` | 1 → **DELETE** (D1-2: confirmado identidad de login de prueba) | seed |
| `whois_history` | 2 filas con registrador fabricado `ICANN Registrar Corp` | `osint-executors.ts:55-103` |
| Integraciones + `integration_data` (ga4/bing) | 2 + 2 | seed 2026-05-08 |
| SEO: `competitors`(1), `competitor_keywords`(1), `keyword_targets`(2), `rank_history`(1), `backlinks`(1), `backlink_history`(1) | 7 | seed |
| `ab_tests`(1), `ab_test_results`(1) | 2 | seed |
| `adversary_assessments` | 3 (runs simulados) | `scenario-runner.ts` |
| `exec_briefs` | 4 → **KEEP** (D1-3: son de un proyecto real, `bpoma.com` — no se borran) | seed/backfill |
| `findings [SIM]` / `203.0.113.*` | **0** (esas rutas aún no persistieron) | — |
| Usuario E2E `smoke-test@strategicconnex.test` | 1 → **KEEP** (credencial del gate de smoke, `.env.local`) | smoke |

**Fuentes de falsedad en código (fuera de tests/fixtures ≈ 240 ficheros que NO se tocan):**

*UI (19):* `useAiChat.ts:25-40` (chat guionizado), `IntelligenceTab.tsx:194-245,229,294-314`
(console simulada + `Math.random` KB/s + pasos), `CopilotConsole.tsx:40-46` (`COPILOT_STEPS`),
`IntelligenceShell.tsx:36,43,85-91,127-132,102` (`DEMO_EVENTS/DEMO_EVIDENCES`), `TelemetryTimeline.tsx:33,42,46`,
`EvidencesList.tsx:34,43,47`, `NetworkOsintSection.tsx:416-424` (DNSBL "Seguro" de mentira),
`MonitoringTab.tsx:246-255,350-361,399-407` (alertas/Slack fabricados), `AuditControl.tsx:61-81`
(progreso aleatorio), `MailSecurityPanel.tsx:434` (TLS hardcodeado), `QuickMetricsHud.tsx:22,32`,
`GeoMap.tsx:92-96`, `ProjectCard.tsx:46-47,73-75` (badge demo), `AttackSurfaceGraph.tsx:145-170`
(expansión sintética), `api/intelligence/graph/route.ts` (payload mock completo) + `route.test.ts`.

*Backend que escribe en BD (14):* `network-executors.ts:147-148` (`Math.random` en ping),
`:33-63,320-324,421-431,555-562` (GeoIP/ASN deterministas), `:394-479,490-499` (traceroute
simulado + finding), `:812-843` (`site1.<ip>.domain.net`), `:863-910` (reputación 100/100);
`advanced-executors.ts:27-58` (BGP/RPKI fake con finding high), `:79-110` (threat-intel
critical fake); `osint-executors.ts:55-103,124-126` (WHOIS inventado → `whois_history`);
`discovery/ct-monitor.ts:49-61,150` (`203.0.113.x`); `adversary/scenario-runner.ts:132-206` +
`src/trigger/adversary.trigger.ts:26-28` (cron 6h que persiste output simulado + findings `[SIM]`);
`src/shared/db/seed.ts:22-209` (escribe en prod **sin guarda de entorno**).

*Scripts sin guarda:* `src/scripts/e2e-ai-report.ts` (60 días de GSC/GA4 falsos),
`src/scripts/e2e-adversary-flow.ts`, `src/scripts/test-rls.ts`, `scripts/manual/test-rls-root.ts`,
`scripts/manual/rls-fire-test.ts`, `scripts/e2e/post-rls-check.mjs` (default
`https://scaudit.vercel.app`, sin cleanup), `src/scripts/setup-admin.ts`.

*CI:* `.github/workflows/ci.yml` → job `api-contract-test` (líneas 256-315) **escribe en prod
en cada push/PR** con `SCAUDIT_API_KEY`; job `e2e` usa `DATABASE_URL` de prod.

**Calibración de guardas (grep real, sin tests):** `Math.random` en `src/` = 15 hits →
**legítimos**: `src/components/NeuralNetworkBackground.tsx` (decorativo) y
`src/app/api/looker-studio/route.ts:346` (sólo comentario sobre el flag `isDemoData`);
**ilegítimos**: `graph/route.ts:28`, `IntelligenceTab.tsx:229`, `network-executors.ts:148`.
Marcadores `DEMO_EVENTS|DEMO_EVIDENCES|simulateConsoleLogs|COPILOT_STEPS|generateSimulatedOutput|SEED_PHANTOM` = 15 hits, **todos ilegítimos** (después de la Fase 2-3 deben quedar **0**).

---

## File structure

```
scripts/db/fake-data-audit.mjs          # NUEVO  Task 1  (read-only, --fail-on-error)
scripts/lib/db-connection.mjs           # NUEVO  Task 2  (política TLS única de los scripts de BD)
tests/security/db-connection-ssl.test.ts # NUEVO Task 2  (guard: el `sslmode` no puede pisar el `ssl`)
scripts/db/fake-data-purge.mjs          # NUEVO  Task 3  (dry-run por defecto, --apply --confirm)
scripts/lib/assert-env.mjs              # NUEVO  Task 7  (assertNotProd / assertAllowProd)
scripts/guard-fake-data.mjs             # NUEVO  Task 19 (guard estático pnpm guard:fakedata)
scripts/db/fake-data-policy.json        # NUEVO  Task 19 (denylist/allowlist versionada)
docs/architecture/DATA-INTEGRITY.md     # NUEVO  Task 21 (política, gate --min 80)
src/shared/db/seed.ts                   # BORRAR Task 6
src/app/api/intelligence/graph/*        # BORRAR Task 13 (route.ts + route.test.ts)
src/features/intelligence/hooks/useAiChat.ts       # EDIT Task 14 → /api/ai/copilot
src/features/dashboard/AttackSurfaceGraph.tsx      # EDIT Task 13 (sin expansión sintética)
src/features/dashboard/tabs/IntelligenceTab.tsx    # EDIT Task 16 (WIP: exigir confirmación)
src/server/intelligence/executors/*.ts             # EDIT Tasks 8-11 (sin fallbacks inventados)
src/server/intelligence/discovery/ct-monitor.ts    # EDIT Task 10 (ip: null)
src/server/intelligence/adversary/scenario-runner.ts # EDIT Task 12 (no persistir simulación)
package.json                            # EDIT Tasks 1,19 (scripts db:fake-audit, guard:fakedata)
.github/workflows/ci.yml                # EDIT Task 20 (job fake-data-audit)
.githooks/pre-commit                    # EDIT Task 20 (gate local)
```

---

# Fase 0 — Medición y red de seguridad

## Task 1: Auditor de datos falsos en BD (read-only)

**Files:** `scripts/db/fake-data-audit.mjs` (nuevo), `package.json` (script `db:fake-audit`)

**Interfaces:**
- `node scripts/db/fake-data-audit.mjs` → imprime hallazgos clasificados `DELETE | REVIEW | KEEP`, **exit 1** si hay algún `DELETE`.
- `--json` → mismo informe en JSON (para CI/artefactos). `--no-fail` → exit 0 siempre (dry-run).
- `--tables a,b` → sólo esas tablas. Lee `DATABASE_URL` de `.env.local` (mismo patrón que
  `scripts/manual/backup-manager.ts:6-8`).

**Pasos:**

1. [ ] Crear `scripts/db/fake-data-audit.mjs`:

```js
#!/usr/bin/env node
/**
 * Auditor de datos falsos en la BD — SÓLO LECTURA.
 *
 * Escanea las tablas de `public` en busca de los patrones de datos inventados
 * documentados en docs/architecture/DATA-INTEGRITY.md y clasifica cada fila:
 *   DELETE — basura segura (la purga la hace fake-data-purge.mjs)
 *   REVIEW — ambigua; requiere decisión humana
 *   KEEP   — excepción operativa (ej. el usuario del smoke E2E)
 *
 * Uso:
 *   node scripts/db/fake-data-audit.mjs                # informe; exit 1 si hay DELETE
 *   node scripts/db/fake-data-audit.mjs --json
 *   node scripts/db/fake-data-audit.mjs --no-fail      # informe sin fallar
 *   node scripts/db/fake-data-audit.mjs --tables projects,users
 *   node scripts/db/fake-data-audit.mjs --fail-on-error  # explícito (CI)
 *
 * Convención de exit: 0 = limpio (o sólo KEEP/REVIEW), 1 = hay DELETE pendiente,
 * 2 = error de ejecución (BD inaccesible, etc.).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

/** Patrones globales: se aplican a TODAS las tablas de public. */
const PATTERNS = [
  { id: "demo-domain",        kind: "DELETE", find: ["example.com", "example.org", "example.net"] },
  { id: "seed-fake-email",    kind: "DELETE", find: ["client@company.com", "usera_", "userb_"] },
  { id: "fake-registrar",     kind: "DELETE", find: ["ICANN Registrar Corp"] },
  { id: "fake-ip-testnet",    kind: "DELETE", find: ["203.0.113."] },
  { id: "sim-marker",         kind: "DELETE", find: ["[SIM]"] },
  { id: "fake-cohosted",      kind: "DELETE", find: ["site1.", ".domain.net"] },
  { id: "seed-competitor",    kind: "DELETE", find: ["competitor1.com"] },
  { id: "ambiguous-admin",    kind: "REVIEW", find: ["admin@strategicaudit.pro"] },
  { id: "seed-pipeline",      kind: "DELETE", find: ["pipeline test"] },
];

/** Excepciones que NUNCA se reportan como hallazgo (operativas). */
const KEEP = ["smoke-test@strategicconnex.test"];

const SKIP_TABLES = /^(drizzle_|pg_|_)/;
const TEXT_TYPES = new Set(["text", "character varying", "json", "jsonb", "xml"]);

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (name) => process.argv.includes(name);
const jsonOut = has("--json");
const noFail = has("--no-fail");
const failOnError = has("--fail-on-error") || !noFail;
const onlyTables = (arg("--tables") || "").split(",").map((s) => s.trim()).filter(Boolean);

function out(line) { if (!jsonOut) console.log(line); }

async function main() {
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) { console.error("ERROR: DATABASE_URL/DIRECT_URL no encontrada en .env.local"); process.exit(2); }

  // Corregido el 2026-10-11: la política TLS vive en `scripts/lib/db-connection.mjs`
  // (import { connectionFor } from "../lib/db-connection.mjs"). NO reintroducir
  // `rejectUnauthorized: DB_ALLOW_INSECURE_SSL === "true"`: invierte el flag (con la
  // variable a `true` exigía verificación estricta) y `pg@8.20` además pisa el objeto
  // `ssl` con el `sslmode` del DSN.
  const pool = new pg.Pool({ ...connectionFor(url), max: 2 });
  try {
    const tablesRes = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename NOT LIKE 'drizzle_%'
      ORDER BY tablename`);
    const tables = tablesRes.rows.map((r) => r.tablename)
      .filter((t) => !SKIP_TABLES.test(t))
      .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

    const findings = [];
    let scanned = 0;

    for (const table of tables) {
      const colsRes = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table]);
      const cols = colsRes.rows.filter((c) => TEXT_TYPES.has(c.data_type)).map((c) => c.column_name);
      if (cols.length === 0) continue;

      // WHERE parametrizado: strpos evita problemas de escape de ILIKE.
      const params = [];
      const ors = [];
      for (const p of PATTERNS) {
        for (const f of p.find) {
          params.push(f.toLowerCase());
          const ph = `$${params.length}`;
          ors.push(cols.map((c) => `strpos(lower(${c}::text), ${ph}) > 0`).join(" OR "));
        }
      }
      if (ors.length === 0) continue;
      const where = `(${ors.join(" OR ")})`;
      const sql = `SELECT to_jsonb(t) AS row FROM "public"."${table}" t WHERE ${where} LIMIT 50`;
      const res = await pool.query(sql, params);
      scanned++;
      for (const r of res.rows) {
        const blob = JSON.stringify(r.row).toLowerCase();
        const keepHit = KEEP.some((k) => blob.includes(k.toLowerCase()));
        const matched = PATTERNS.filter((p) => p.find.some((f) => blob.includes(f.toLowerCase())));
        if (keepHit && !matched.some((p) => p.kind === "DELETE")) continue; // excepción operativa
        const kind = matched.some((p) => p.kind === "DELETE") ? "DELETE" : "REVIEW";
        findings.push({
          table, kind,
          patterns: matched.map((p) => `${p.kind}:${p.id}`),
          sample: r.row,
        });
      }
    }

    await pool.end();

    const count = (k) => findings.filter((f) => f.kind === k).length;
    const byTable = {};
    for (const f of findings) byTable[f.table] = (byTable[f.table] || 0) + 1;
    const report = {
      generatedAt: new Date().toISOString(),
      url: "supabase:" + (url.match(/qwebfomwtwxxbkxbrrwm/) ? "qwebfomwtwxxbkxbrrwm" : "otro"),
      tablesScanned: scanned, delete: count("DELETE"), review: count("REVIEW"), findings,
    };

    if (jsonOut) console.log(JSON.stringify(report, null, 2));
    else {
      out(`Auditoría de datos falsos — ${report.generatedAt}`);
      out(`Tablas escaneadas: ${scanned}`);
      out(`DELETE=${report.delete}  REVIEW=${report.review}`);
      for (const f of findings) {
        out(`  [${f.kind}] ${f.table} <- ${f.patterns.join(", ")}`);
        out(`           ${JSON.stringify(f.sample).slice(0, 160)}`);
      }
      out(report.delete === 0 ? "RESULTADO: sin basura DELETE." : "RESULTADO: hay basura DELETE pendiente.");
    }

    process.exit(report.delete > 0 && failOnError ? 1 : 0);
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(2);
  }
}

main();
```

**Ampliación D1-3 (2026-10-10):** además de los patrones de texto, el auditor resuelve las
filas que **no** tienen patrón propio por su FK al proyecto demo (`exec_briefs.project_id`
→ los `id` de los proyectos marcados `DELETE`), y las reporta como `DELETE` con el patrón
sintético `DELETE:demo-project-fk`. Es la evidencia que faltaba para cerrar D1-3.

**Ampliación 2026-10-11 (misma política que la purga):** el auditor dejó de mirar sólo
`exec_briefs` y aplica la regla completa: FK directa `project_id` → `projects`
(`PROJECT_SCOPED_TABLES`, 26 tablas) **más** el cierre por `ON DELETE CASCADE` desde una fila
candidata (`PROJECT_SCOPED_CASCADE_TABLES`). Deduplica por PK, así que su `DELETE` es
exactamente la unión que la purga borra: si divergieran, la Fase 1 podría cerrar con basura
invisible para una de las dos herramientas (o exigir `DELETE=0` sobre un conjunto que la purga
deja intacto). El listado en texto va agrupado por tabla (`× N`) para que una tabla con miles de
filas demo no convierta el informe en un volcado; el detalle por fila sigue en `--json`.
Salida redactada: el informe guarda PK y **sólo** las columnas que contienen el patrón
(truncadas), nunca la fila completa — así los logs y el artefacto de CI no arrastran
hashes ni secretos; la sesión se abre en modo read-only.
2. [ ] Añadir a `package.json` → `"scripts"` (junto a `db:drift-check`):
   ```json
   "db:fake-audit": "node scripts/db/fake-data-audit.mjs"
   ```

3. [ ] **TDD (rojo → verde):** ejecutar contra la BD real:
   ```powershell
   node scripts/db/fake-data-audit.mjs
   ```
   - **Rojo esperado:** exit **1** con `DELETE>0` (proyectos `example.*`, usuarios `usera_*`, …).
   - Guardar el informe como línea base:
     `node scripts/db/fake-data-audit.mjs --json > backups/fake-data-baseline-2026-10-06.json`
     (la carpeta `backups/` ya está en `.gitignore` → el fichero no se commitea).
   - Si devuelve exit 2, es un problema de conexión (revisa `.env.local`), no un falso verde.

**Ejecutado el 2026-10-11 tras cerrar D1-2 (SOLO LECTURA):** mismo barrido (71 tablas, 6
proyectos demo) con `admin@strategicaudit.pro` ya clasificado como `DELETE` → **DELETE = 155,
REVIEW = 0**. El auditor queda así alineado con la decisión del operador: la Fase 1 puede
exigir `DELETE=0` como criterio de aceptación sin que una fila `REVIEW` decidida por el
operador quede fuera de la purga.

**Ejecutado el 2026-10-11 con la política completa (SOLO LECTURA):** 78 tablas escaneadas,
9 proyectos demo/fixture, **DELETE = 4.515, REVIEW = 0** — 158 filas por patrón y el resto por
la regla project-scoped (FK directa + cierre por CASCADE). Coincide fila a fila con la
`UNIÓN real a borrar … 4515 fila(s)` de la purga: es la cifra que debe quedar en 0 tras la
Task 4, y el `notDeclaredCascade` del informe salió vacío.

**Ejecutado el 2026-10-10 contra la BD real (SOLO LECTURA):** 71 tablas escaneadas,
6 proyectos demo, **DELETE = 153**, **REVIEW = 2** (ambas, `admin@strategicaudit.pro`).
Señales que el inventario base no tenía: `intelligence_tool_runs` (47), `intelligence_findings`
(24), `security_audit_logs` (16), `user_logs` (14), `users` (14), `dns_history` (11) e
`intelligence_investigations` (8). El marcador `[SIM]` sigue en 0. Línea base guardada en
`backups/fake-data-baseline-2026-10-10.json` (carpeta ignorada por git).

**Verificación:** `node scripts/db/fake-data-audit.mjs; $LASTEXITCODE` → `1` con hallazgos
coincidentes con el inventario base (≥5 proyectos `example.*`, ≥12 usuarios `usera/userb_`).

**Commit (sólo si el usuario lo pide):** `feat(db): auditor de datos falsos read-only con fail-on-error`
→ `scripts/db/fake-data-audit.mjs package.json`.

---

## Task 2: Backup completo previo a cualquier purga

**Files:** `scripts/manual/backup-manager.ts` (EDITADO: fix de SSL + modo `--check`)

**Requisito previo (resuelto el 2026-10-11):** este script **no podía conectar**. Tenía el
mismo bug de SSL que el auditor, por partida doble: `pg@8.20`
(`connection-parameters.js:59-60`) parsea el `connectionString` DESPUÉS y pisa el objeto
`ssl`, y su cálculo `rejectUnauthorized: DB_ALLOW_INSECURE_SSL === "true"` **invertía el
flag** (con `DB_ALLOW_INSECURE_SSL=true` en `.env.local`, es decir pidiendo inseguridad,
exigía verificación estricta). Ambos se corrigen en `scripts/lib/db-connection.mjs`, con
guard de regresión en `tests/security/db-connection-ssl.test.ts`.

**Pasos:**

1. [x] Confirmado que `/backups/` sigue en `.gitignore` (verificado: sí).
2. [x] Prueba de conexión seca (no escribe nada):
   ```powershell
   npx tsx scripts/manual/backup-manager.ts --check
   ```
   Resultado real (2026-10-11): `✅ Conexión OK — base: postgres · TLS en el socket: sí`,
   servidor PostgreSQL 17.6, exit 0. El `--check` lee el cifrado **del socket local**: por el
   pooler la conexión backend↔pooler es local y `pg_stat_ssl.ssl` diría `false` aunque
   nuestro tramo sí vaya cifrado, así que no sirve como señal.
3. [x] Volcado completo de `public` como INSERTs:
   ```powershell
   npx tsx --env-file=.env.local scripts/manual/backup-manager.ts
   ```
   Resultado real (2026-10-11): `backups/strategic_audit_pro_backup_2026-10-11T14-26-58-557Z.sql`,
   **8,45 MB**, exit 0.
4. [x] Verificar el contenido con **identificadores entrecomillados**, que es como los emite
   el script (`INSERT INTO public."projects"`, no `INSERT INTO public.projects`: el grep
   original de este plan no encontraba nada y hacía parecer vacío un backup correcto):
   ```powershell
   $f = (Get-ChildItem backups\*.sql | Sort-Object LastWriteTime -Descending)[0].FullName
   (Select-String -Path $f -Pattern 'INSERT INTO public\."projects"'   -AllMatches).Matches.Count  # 21
   (Select-String -Path $f -Pattern 'INSERT INTO public\."users"'      -AllMatches).Matches.Count  # 21
   (Select-String -Path $f -Pattern 'INSERT INTO public\."exec_briefs"' -AllMatches).Matches.Count  # 4
   ```
   Medido: 27 672 líneas `INSERT` en 51 tablas distintas, 21 `projects`, 21 `users` y
   4 `exec_briefs` (coincide con D1-3: los briefs existen y son de proyectos reales).

**Verificación:** fichero de backup con fecha de hoy y con INSERTs de `projects` y `users`. ✅
**No se commitea** (`backups/` ignorado).

**Limitación conocida (no bloqueante, anotada):** el volcado es **sólo datos** — no emite DDL
(`CREATE TABLE`) ni cubre `auth.users`, así que una restauración exige que el schema ya exista
(migraciones aplicadas) antes de reinyectar los INSERT. Es el comportamiento del script
existente; para un dump restaurable desde cero hace falta `pg_dump` o generar el DDL aparte
(ver *Riesgos y pendientes abiertos*).

---

# Fase 1 — Purgar lo ya persistido

## Task 3: Script de purga con dry-run obligatorio

**Files:** `scripts/db/fake-data-purge.mjs` (nuevo) + `scripts/lib/fake-data-patterns.mjs`
(fuente única de patrones/allowlist/recuento, compartida con el auditor) + `package.json`
(`db:fake-purge`).

**ESTADO: ENTREGADO el 2026-10-11.** Contrato real (la spec en código de más abajo queda como
referencia histórica; el contrato es este):

- `node scripts/db/fake-data-purge.mjs` → **dry-run** (por defecto): compara candidatos con el
  recuento esperado, analiza el grafo de FK y **no escribe nada**. Exit 0 si está limpio,
  **exit 1 si hay bloqueos**.
- `--apply --confirm YYYY-MM-DD` → ejecuta en **una sola transacción** (`BEGIN … COMMIT`, error ⇒
  `ROLLBACK` total) y sólo si `--confirm` es la fecha de hoy. **Exit 2 si hay bloqueos.**
- `--accept-cascade` → acepta explícitamente el borrado en cascada de filas no candidatas.
  Nunca acepta `RESTRICT`/`NO ACTION` (esos hacen fallar el `DELETE` y exigen cambiar el alcance).
- `--tables a,b` → restringe el alcance (el gate de recuento se limita a esas tablas).
- `--json` → informe para artefactos de CI.

**Deltas respecto a la spec original (a propósito):**
1. Los patrones/allowlist/recuento viven en `scripts/lib/fake-data-patterns.mjs`: el auditor y la
   purga comparten una sola verdad (duplicarlos ya nos costó una clase de bugs con el SSL).
2. **No borra `auth.users`.** `public.users` y `auth.users` sólo coinciden en 6 de 21 filas y
   ninguno de los 14 candidatos tiene identidad: borrar una identidad es una operación de cuenta,
   no una limpieza de datos. La purga lo **informa** (`authIdentities.notTouched`).
3. **Gate de dependencias** (no estaba en la spec): `CASCADE`/`SET NULL` sobre filas no candidatas
   se detectan ANTES de borrar. Sin él, `projects.owner_id ON DELETE CASCADE` habría borrado
   proyectos reales «con éxito».
4. `pg.Client` único en vez de `Pool`: con `Pool`, un error en la ruta de error dejaba
   `pool.end()` esperando a que se liberase un cliente prestado (el script se colgaba).
5. Guarda contra ciclos de FK en el orden de borrado.
6. **Regla «project-scoped»** (decisión del operador, 2026-10-11): toda tabla con una FK de una
   columna `project_id` hacia `projects` se purga con el proyecto demo, **más** el cierre por
   `ON DELETE CASCADE` desde una fila candidata (`ab_test_results`, `rank_history`,
   `developer_api_keys`…). El conjunto va declarado (`PROJECT_SCOPED_TABLES` +
   `PROJECT_SCOPED_CASCADE_TABLES`) y la purga lo compara con el que descubre en la BD: una
   tabla nueva que aparezca por el cierre bloquea el `--apply`
   (`declaredProjectScoped.notDeclaredCascade`) hasta declararla. Para qué: sin esto, esas filas
   desaparecían por cascada **en silencio y fuera del snapshot** (no restaurables) y el `DELETE`
   de los proyectos demo quedaba retenido por FKs `NO ACTION`.
7. **Dos gates de recuento** (`PURGE_EXPECTED` = 158 por patrón, `PURGE_EXPECTED_PROJECT_SCOPED`
   = 4.430) y una **guarda de coherencia** al arrancar: un recuento declarado sobre una tabla
   fuera del allowlist aborta con exit 2 en vez de producir un `⚠️` que se aprende a ignorar
   (así se detectó que `uptime_logs` tenía un esperado de 11 imposible: esa tabla está fuera de
   `PURGE_TABLES` y su basura sólo entra por la regla project-scoped).
8. **Tope de filas por tabla**: si una tabla devuelve exactamente `ROWS_PER_TABLE` (500) filas,
   puede haber más basura sin listar; el dry-run lo avisa en vez de darlo por bueno.
9. `today()` en **fecha local** (no UTC): con UTC, el gate del `--confirm` fallaría para siempre
   después de las 21:00 en UTC−3 aunque el operador escribiera la fecha correcta.

**Diseño (importante):** reutiliza los patrones del auditor, pero es **conservador**: sólo
borra filas en las tablas permitidas de `PURGE_TABLES` y siempre por **PK extraída del propio
registro** (`to_jsonb`). Borra en orden FK-safe introspectando `pg_constraint` (hijos sin
`ON DELETE CASCADE` primero) y respeta la allowlist `KEEP` (usuario del smoke).

Dos matices que conviene tener escritos:

- **`KEEP` es más fuerte en la purga que en el auditor.** El auditor respeta `KEEP` sólo si la
  fila no trae además basura `DELETE`; la purga se salta la fila siempre (`if (kept) continue;`).
  Es deliberado: prefiero dejar una fila de más que romper el gate de smoke.
- **Hijo sin `CASCADE` de un proyecto demo:** si existe y no tiene patrón de texto propio, no
  entra en `byTable` y el `DELETE` del padre falla por FK → `ROLLBACK` completo. Es el fallo
  ruidoso que queremos (nada a medias); la tabla se añade a `PURGE_TABLES` con su patrón o se
  decide a mano en la revisión (Task 3.3).

**Pasos:**

1. [ ] Crear `scripts/db/fake-data-purge.mjs`:

```js
#!/usr/bin/env node
/**
 * Purga de datos falsos — DRY-RUN POR DEFECTO.
 *
 *   node scripts/db/fake-data-purge.mjs                     # dry-run (no escribe)
 *   node scripts/db/fake-data-purge.mjs --apply --confirm 2026-10-06
 *
 * Reglas de seguridad:
 *   1. Nunca escribe sin --apply + --confirm <hoy>.
 *   2. Todo ocurre en UNA transacción (cualquier error ⇒ ROLLBACK).
 *   3. Sólo borra en PURGE_TABLES y sólo por PK detectada en la fila.
 *   4. Antes de borrar, vuelca cada fila a backups/fake-data-purge-<ts>.json (restore manual).
 *   5. NUNCA borra la allowlist KEEP (usuario E2E del smoke).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(ROOT, ".env.local") });

const apply = process.argv.includes("--apply");
const confirmIdx = process.argv.indexOf("--confirm");
const confirm = confirmIdx === -1 ? undefined : process.argv[confirmIdx + 1];
const tableIdx = process.argv.indexOf("--tables");
const onlyTables = tableIdx === -1 ? [] : process.argv[tableIdx + 1].split(",").map((s) => s.trim());

/**
 * Tablas donde SÍ se permite borrar. **AMPLIADA el 2026-10-11** con los
 * hallazgos reales del auditor, por tabla: la lista original sólo cubría 18
 * tablas y dejaba fuera el grueso de la basura (los `intelligence_*`, los
 * logs y los históricos de dominio), así que la purga habría terminado en
 * `DELETE>0` perpetuo. Todo lo que no esté aquí se informa como REVIEW.
 *
 * `exec_briefs` queda FUERA a propósito (D1-3: sus 4 filas son de un proyecto
 * real y no se borran; las de un proyecto demo las retira el `ON DELETE
 * CASCADE` de `exec_briefs.project_id`).
 */
const PURGE_TABLES = new Set([
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
  // telemetría y auditoría que los flujos de prueba escribieron
  "security_audit_logs", "user_logs", "schema_validations",
  "performance_results", "crawl_results", "heatmap_sessions", "issues",
  // escenarios simulados
  "adversary_assessments", "scenario_runs",
  // identidades (KEEP_ROWS protege al usuario del smoke)
  "users",
]);
const KEEP_ROWS = [
  { table: "users", match: "smoke-test@strategicconnex.test" },
];
const PATTERNS = [
  "example.com", "example.org", "example.net",
  "client@company.com", "usera_", "userb_",
  "ICANN Registrar Corp", "203.0.113.", "[SIM]", "site1.", "competitor1.com",
  "pipeline test",
  // `.domain.net` es la mitad que faltaba del patrón `fake-cohosted` del
  // auditor (aparece en `intelligence_findings` e `intelligence_tool_runs`).
  ".domain.net",
  // D1-2 (confirmada por el operador el 2026-10-11): identidad de login de
  // prueba, no el admin real. Sin este patrón la purga NO la tocaría.
  "admin@strategicaudit.pro",
];
const TEXT_TYPES = new Set(["text", "character varying", "json", "jsonb", "xml"]);

function today() { return new Date().toISOString().slice(0, 10); }

async function findCandidates(pool) {
  const tablesRes = await pool.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE 'drizzle_%' ORDER BY tablename`);
  const tables = tablesRes.rows.map((r) => r.tablename)
    .filter((t) => PURGE_TABLES.has(t))
    .filter((t) => onlyTables.length === 0 || onlyTables.includes(t));

  const out = [];
  for (const table of tables) {
    const colsRes = await pool.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1`, [table]);
    const cols = colsRes.rows.filter((c) => TEXT_TYPES.has(c.data_type)).map((c) => c.column_name);
    const pkRes = await pool.query(
      `SELECT kcu.column_name FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
       WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
       ORDER BY kcu.ordinal_position`, [table]);
    const pk = pkRes.rows.map((r) => r.column_name);
    if (cols.length === 0 || pk.length === 0) continue; // sin PK no se toca

    const params = [];
    const ors = [];
    for (const p of PATTERNS) {
      params.push(p.toLowerCase());
      const ph = `$${params.length}`;
      ors.push(cols.map((c) => `strpos(lower(${c}::text), ${ph}) > 0`).join(" OR "));
    }
    const res = await pool.query(
      `SELECT to_jsonb(t) AS row FROM "public"."${table}" t WHERE (${ors.join(" OR ")}) LIMIT 500`,
      params);

    for (const r of res.rows) {
      const blob = JSON.stringify(r.row);
      const kept = KEEP_ROWS.find((k) => k.table === table && blob.toLowerCase().includes(k.match.toLowerCase()));
      if (kept) continue; // allowlist operativa
      out.push({ table, pk, id: pk.map((c) => r.row[c]), row: r.row });
    }
  }
  return out;
}

/** Hijos con FK hacia `table` que NO cascaden → hay que vaciarlos antes. */
async function dependents(pool, table) {
  const res = await pool.query(`
    SELECT DISTINCT cl.relname AS child
    FROM pg_constraint f
    JOIN pg_class cl ON cl.oid = f.conrelid
    JOIN pg_class pl ON pl.oid = f.confrelid
    JOIN pg_namespace n ON n.oid = pl.relnamespace
    WHERE f.contype = 'f' AND pl.relname = $1 AND f.confdeltype <> 'c'
      AND n.nspname = 'public' AND cl.relname <> $1
    ORDER BY 1`, [table]);
  return res.rows.map((r) => r.child);
}

function idList(ids) { return ids.map((a) => `(${a.map((v) => v === null ? "NULL" : v === undefined ? "NULL" :
  typeof v === "number" ? v : `'${String(v).replace(/'/g, "''")}'`).join(", ")})`).join(", "); }

async function main() {
  if (apply && confirm !== today()) {
    console.error(`ERROR: --apply exige --confirm ${today()} (recibido: ${confirm ?? "nada"}).`);
    process.exit(2);
  }
  const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!url) { console.error("ERROR: falta DATABASE_URL/DIRECT_URL en .env.local"); process.exit(2); }

  // Corregido el 2026-10-11: la política TLS vive en `scripts/lib/db-connection.mjs`
  // (import { connectionFor } from "../lib/db-connection.mjs"). NO reintroducir
  // `rejectUnauthorized: DB_ALLOW_INSECURE_SSL === "true"`: invierte el flag (con la
  // variable a `true` exigía verificación estricta) y `pg@8.20` además pisa el objeto
  // `ssl` con el `sslmode` del DSN.
  const pool = new pg.Pool({ ...connectionFor(url), max: 2 });
  try {
    const candidates = await findCandidates(pool);
    const byTable = {};
    for (const c of candidates) (byTable[c.table] ||= []).push(c);

    console.log(`Purga de datos falsos — modo ${apply ? "APPLY" : "DRY-RUN"} — ${new Date().toISOString()}`);
    for (const [table, rows] of Object.entries(byTable)) {
      console.log(`  ${table}: ${rows.length} fila(s) -> ${rows.slice(0, 5).map((r) => JSON.stringify(r.id)).join(" ")}`);
    }
    if (candidates.length === 0) { await pool.end(); console.log("Nada que borrar."); process.exit(0); }

    if (!apply) {
      console.log("DRY-RUN: no se ha escrito nada. Para aplicar:");
      console.log(`  node scripts/db/fake-data-purge.mjs --apply --confirm ${today()}`);
      await pool.end();
      process.exit(0);
    }

    // 1) Snapshot de las filas que se van a borrar (restore manual).
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = path.join(ROOT, "backups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `fake-data-purge-${ts}.json`), JSON.stringify(candidates, null, 2));

    // 2) Orden seguro: hijos sin cascade antes que sus padres.
    const tables = Object.keys(byTable);
    const order = [];
    for (const t of tables) for (const d of await dependents(pool, t)) if (!order.includes(d)) order.push(d);
    for (const t of tables) if (!order.includes(t)) order.push(t);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const table of order) {
        // Se borran sólo las filas candidatas de ESTA tabla (y sus descendientes por cascade).
        const rows = byTable[table];
        if (!rows) continue;
        const pk = rows[0].pk;
        const res = await client.query(
          `DELETE FROM "public"."${table}" WHERE (${pk.join(", ")}) IN ${idList(rows.map((r) => r.id))}`);
        console.log(`  DELETE ${table}: ${res.rowCount} fila(s)`);
      }
      // NO IMPLEMENTADO (2026-10-11): `public.users` y `auth.users` sólo coinciden en 6 de 21
      // filas y NINGUNO de los 14 candidatos tiene identidad; el bloque de abajo habría borrado 0
      // filas y, si alguna vez coincidiese, borraría una cuenta de login. La purga lo informa.
      // auth.users (sólo para usuarios candidatos de public.users)
      const users = byTable.users;
      if (users && users.length) {
        const res = await client.query(
          `DELETE FROM auth.users WHERE id = ANY($1)`,
          [users.map((r) => r.id[0])]);
        console.log(`  DELETE auth.users: ${res.rowCount} fila(s)`);
      }
      await client.query("COMMIT");
      console.log("COMMIT OK. Snapshot en backups/fake-data-purge-" + ts + ".json");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("ROLLBACK por error:", err.message);
      process.exitCode = 2;
    } finally { client.release(); }

    await pool.end();
  } catch (err) {
    console.error("ERROR:", err.message);
    await pool.end().catch(() => {});
    process.exit(2);
  }
}

main();
```

2. [ ] Ejecutar **dry-run**:
   ```powershell
   node scripts/db/fake-data-purge.mjs
   ```
   Salvar la salida (`backups/fake-data-purge-dryrun-2026-10-06.txt`) y compararla con el
   inventario base de este plan.

3. [ ] **Revisión obligatoria (D1) — ambigüedades YA RESUELTAS (2026-10-11):** presentar el
   listado al operador y esperar confirmación antes de cualquier `--apply`.
   - `Pipeline Test - strategicconnex.com.ar` → **DELETE** (D1-1, decidido por el operador).
   - `admin@strategicaudit.pro` → **DELETE** (D1-2, confirmado por el operador).
   - `exec_briefs` (4) → **NO se borran**: cuelgan del proyecto real `Consultora BPOMA` (D1-3).
   - Si algún candidato no está en `PURGE_TABLES`, se informa como REVIEW (no se borra).

**Filas sin patrón propio:** hay tablas (p. ej. `integrations`, `integration_data`,
`adversary_assessments`) que puede que no coincidan con ningún patrón de texto; sólo entran
en la purga por su FK al proyecto demo (cascade) o por su propio patrón.
**`exec_briefs` queda FUERA:** sus 4 filas pertenecen a `Consultora BPOMA` (`bpoma.com`),
un proyecto real — ver D1-3. El dry-run debe mostrar 0 filas de esa tabla.
**Orden obligatorio:** borrar los proyectos demo antes que sus dependientes, y **verificar
en el dry-run, tabla por tabla**, que el recuento cuadra con la línea base antes de cualquier
`--apply`.

**Recuento esperado en el dry-run — tabla HISTÓRICA (línea base 2026-10-10: 155 filas por
patrón).** El recuento vigente tiene dos gates (patrón **158** + project-scoped **4.430**) y
vive en `scripts/lib/fake-data-patterns.mjs`; esta tabla se conserva como referencia de cómo se
llegó al allowlist y **no** debe usarse para juzgar un dry-run de hoy:

| Tabla | Filas | Tabla | Filas |
|---|---:|---|---:|
| `intelligence_tool_runs` | 47 | `dns_history` | 11 |
| `intelligence_findings` | 24 | `intelligence_investigations` | 8 |
| `security_audit_logs` | 16 | `projects` | 6 |
| `user_logs` | 14 | `crawl_results` | 2 |
| `users` | 14 | `whois_history` | 2 |
| `ab_tests`, `backlinks`, `competitors`, `heatmap_sessions`, `integration_data_bing`, `integration_data_gsc`, `intelligence_run_events`, `internal_links`, `issues`, `performance_results`, `schema_validations` | 1 cada una (11) | **`exec_briefs`** | **0** (D1-3) |

Si un dry-run se desvía de esta tabla, **se investiga antes de aplicar**: la diferencia es
o un cambio real en la BD desde el 2026-10-10 o un patrón que no entró en la purga.
**Verificación:** dry-run exit 0 sin escribir (confirmar después con
`node scripts/db/fake-data-audit.mjs` → los mismos DELETE que antes de la ejecución).

### Dry-run 2026-10-11 tras la decisión del operador (limpio, exit 0) — VIGENTE

```
── Candidatos por PATRÓN vs esperado ──            TOTAL esperado=158  real=158
── Filas PROJECT-SCOPED (9 proyectos demo/fixture: FK directa + cierre por CASCADE) ──
   TOTAL                                           esperado=4430  real=4430
   · de ellas por cierre CASCADE: 11 fila(s) en 8 tabla(s) — ab_test_results(1),
     backlink_history(1), competitor_keywords(1), developer_api_keys(3), dns_history(2),
     integration_sync_logs(1), rank_history(1), report_exports(1)
   UNIÓN real a borrar (patrón ∪ project-scoped, deduplicada): 4515 fila(s)

Sólo DELETE con WHERE sobre PKs, en las tablas del allowlist, en una transacción.

DRY-RUN: limpio — no se ha escrito nada. Para aplicar:
  node scripts/db/fake-data-purge.mjs --apply --confirm 2026-10-11          ← exit 0
```

La unión son **4.515 filas** (158 + 4.430 menos 73 que aparecían por las dos vías), y el
auditor reporta exactamente esas 4.515: el criterio de aceptación (`DELETE=0` tras la purga)
mide lo mismo que la purga borra. Sin `drift`, sin `NO ACTION`, sin cascadas fuera de lo
declarado y sin avisos de tope de filas.

**Escritura verificada sin borrar nada:** `--apply --tables adversary_assessments --confirm <hoy>`
(tabla sin candidatos) → `COMMIT OK — 0 fila(s) borradas`, snapshot escrito y la tabla intacta.
**La purga real no se ha ejecutado.**

### Dry-run real del 2026-10-11 (histórico: los bloqueos previos a la decisión)

```
candidatos=155 · drift=0 · dependencias=24 (bloqueo=4 cascada=1372)
TOTAL   esperado=155  real=155          ← cuadra exactamente tras las migraciones
DRY-RUN: HAY BLOQUEOS — no se ha escrito nada y el --apply sería RECHAZADO.
  · FK que harían fallar el DELETE: projects←audit_logs(NO ACTION), users←audit_logs(NO ACTION),
    users←audits(NO ACTION), users←reports(NO ACTION)
  · cascada no aceptada (1372 filas): repite con --accept-cascade si es intencionado
```

**Los dos bloqueos son el entregable, no un estorbo.** (1) Cuatro relaciones `NO ACTION`
impiden borrar los proyectos demo y los usuarios candidatos: `audit_logs`, `audits` y `reports`
no están en `PURGE_TABLES` y sus filas no llevan patrón, así que las retiene una FK sin cascada.
(2) Aceptar la cascada se llevaría 1.372 filas no apuntadas por los patrones —el grueso,
`uptime_logs` (1.297) de un proyecto demo, más `intelligence_usage_events` (34)— y, sobre
`users`, **los 7 proyectos ajenos al allowlist** que poseen esas cuentas (ver D1-2).

**Decisiones que quedaban abiertas — RESUELTAS por el operador el 2026-10-11:**
- **Sí** a las filas hijas de un proyecto demo: se implementó la regla «project-scoped»
  (FK directa `project_id` + cierre por `ON DELETE CASCADE`), no el `--accept-cascade` ciego:
  así entran enumeradas, contadas y respaldadas en el snapshot.
- **Sí** a `audit_logs`, `audits` y `reports`: entran por esa misma regla, que es más precisa
  que ampliar `PURGE_TABLES` (esas tablas también tienen filas de proyectos reales).
- **D1-2 → traspaso** de los 4 proyectos reales al admin con login; ver *D1-1..D1-3*.

**Camino de escritura verificado sin borrar nada (histórico):** `--apply --tables ab_test_results
--confirm <hoy>` → `COMMIT OK — 0 fila(s) borradas`, snapshot escrito y `ab_test_results`
intacto (1 fila antes y después). El `--apply` sin `--confirm` de hoy sale con exit 2.
⚠️ Ese alcance **ya no sirve como prueba en vacío**: tras la decisión del operador
`ab_test_results` tiene 1 candidato. El equivalente vigente es `--tables adversary_assessments`
(ver el dry-run vigente arriba). **La purga real se ejecutó el 2026-10-11** (ver Task 4: exit 0,
4.515 filas, auditor posterior `DELETE=0`).

**Commit:** `feat(db): purga de datos falsos con dry-run obligatorio y backup`
→ `scripts/db/fake-data-purge.mjs`.

---

## Task 4: Ejecutar la purga aprobada

**Files:** ninguno nuevo

**Pasos:**

1. [x] Backup completo **repetido justo antes de la purga** (2026-10-11, 20:43 UTC):
   `backups/strategic_audit_pro_backup_2026-10-11T20-43-49-505Z.sql` — 8 651 031 bytes
   (**8 448,27 KB**), 27 672 `INSERT`, **51 tablas**, con `projects` (21), `users` (21),
   `exec_briefs` (4) y `uptime_logs` (25 201); 0 sentencias DDL (sólo datos, como documenta la
   Task 2). El `--check` previo confirmó `✅ Conexión OK · TLS en el socket: sí`.
2. [x] Aplicar con la fecha de hoy y el alcance aprobado:
   ```powershell
   node scripts/db/fake-data-purge.mjs --apply --confirm (Get-Date -Format yyyy-MM-dd)
   ```
   **Ejecutado el 2026-10-11 (orden explícita del operador tras revisar el dry-run limpio):**
   `node scripts/db/fake-data-purge.mjs --apply --confirm "$(date +%F)"` → **exit 0**,
   `DELETE <tabla>: N fila(s)` en 38 tablas (los mayores: `uptime_logs` 4 285,
   `intelligence_tool_runs` 47, `intelligence_usage_events` 34, `intelligence_findings` 27,
   `dns_history` 21, `security_audit_logs` 16, `user_logs` 14, `users` 14, `projects` 9) y
   `COMMIT OK — 4515 fila(s) borradas`, snapshot previo en
   `backups/fake-data-purge-2026-10-11T20-45-02-127Z.json`. Sin `ROLLBACK`.
   Nota de reloj: la fecha del gate es la **local de la máquina** (2026-10-11); el `--confirm`
   tiene que coincidir con ella, no con el día que creas que es.
3. [x] Re-auditar:
   ```powershell
   node scripts/db/fake-data-audit.mjs
   ```
   **Resultado real:** `DELETE=0  REVIEW=0`, `76` tablas escaneadas, `proyectos demo: 0`,
   `notDeclaredCascade: []`, exit **0** (`RESULTADO: sin basura DELETE.`). El auditor y la purga
   ven el mismo conjunto, así que el 0 es la prueba de que no quedó basura fuera del alcance.

**Verificación (criterio de aceptación de la Fase 1):** `node scripts/db/fake-data-audit.mjs` →
`DELETE=0  REVIEW=0` (hoy 4.515; el auditor aplica la misma política que la purga, así que el 0
es comparable). Los REVIEW
que el usuario decidió conservar deben añadirse a `KEEP` en `fake-data-audit.mjs`
(allowlist versionada, no un "lo dejamos pasar" silencioso).

**No committear nada más** (la BD no está en git; el snapshot JSON queda en `backups/` ignorado).

---

# Fase 2 — Cortar la generación (backend)

## Task 5: Eliminar `src/shared/db/seed.ts`

**Files:** `src/shared/db/seed.ts` (borrar), `vitest.config.ts`/`tsconfig` si referencian el path

**Pasos:**

1. [x] Comprobar referencias antes de borrar:
   ```powershell
   Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx,*.mjs,*.json -Exclude *.log | Where-Object { $_.FullName -notmatch 'node_modules' } | Select-Object -ExpandProperty FullName) -Pattern "shared/db/seed" | ForEach-Object { $_.Path + ":" + $_.LineNumber }
   ```
2. [x] Borrar el fichero (`git rm src/shared/db/seed.ts` sólo si hay referencia en algún test;
   si la hay, actualizar ese test para que deje de importarlo).
3. [x] Verificar que **nada** del repo lo importa (grep = 0) y que `pnpm build` sigue en verde.

**Verificación:** `Select-String … "shared/db/seed"` → 0 hits; `npx tsc --noEmit` → 0 errores.

**Resultado (2026-10-11):** `git rm src/shared/db/seed.ts` (202 líneas). Referencias: la ÚNICA era la línea de exclusión de cobertura en `vitest.config.ts` (ya retirada); `git grep "shared/db/seed"` → 0 hits en el repo. `npx tsc --noEmit` → exit 0. Era huérfano (no había script npm que lo invocara): la vía legítima de alta de admin es `pnpm setup-admin`.
⚠️ **Desviación de la letra del plan:** en vez de dejar `seed.ts` con guarda se ha **eliminado**. Su único propósito era insertar `client@company.com` / "Client User" / proyectos `example.com` — exactamente las filas de la Fase 1 — y no tenía consumidores.

**Commit:** `refactor(db): eliminar seed.ts (escribía en prod sin guarda)`.

---

## Task 6: `assert-not-prod` compartido para scripts

**Files:** `scripts/lib/assert-env.mjs` (nuevo), `src/scripts/e2e-ai-report.ts`,
`src/scripts/e2e-adversary-flow.ts`, `src/scripts/test-rls.ts`,
`scripts/manual/test-rls-root.ts`, `scripts/manual/rls-fire-test.ts`,
`scripts/e2e/post-rls-check.mjs`, `src/scripts/setup-admin.ts`, `package.json`

**Interfaces:**
```js
// scripts/lib/assert-env.mjs
export function assertNotProd(label, { allowFlag = "--allow-prod" } = {}) → void
// Lanza Error con mensaje claro si el target es producción y no se pasó el flag explícito.
// Detección: process.env.VERCEL_ENV === "production" | process.env.APP_ENV === "production"
//            | la URL contiene "scaudit.vercel.app" y no hay APP_ENV="development"
export function assertCleanupPlan(label, { defaultCleanup = true }) → boolean
```

**Pasos:**

1. [x] Crear `scripts/lib/assert-env.mjs`:

```js
/**
 * Guarda de entorno para scripts de mantenimiento/e2e.
 * Regla: ningún script escribe en producción salvo con --allow-prod explícito
 * y un plan de limpieza declarado.
 */
const PROD_MARKERS = ["scaudit.vercel.app"];

export function targetFromEnv() {
  const explicit = process.env.APP_ENV || process.env.VERCEL_ENV;
  if (explicit) return explicit;
  const raw = process.env.DATABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  return PROD_MARKERS.some((m) => raw.includes(m)) ? "production" : "development";
}

export function assertNotProd(label) {
  const target = targetFromEnv();
  const flag = "--allow-prod";
  if (target === "production" && !process.argv.includes(flag)) {
    throw new Error(
      `[assert-not-prod] ${label} intenta correr contra PRODUCCIÓN (${target}).\n` +
      `  Este script escribe datos de prueba en la BD real.\n` +
      `  Si es imprescindible, relánzalo con ${flag} y un plan de limpieza.`
    );
  }
  return target;
}

export function assertCleanupPlan(label) {
  if (process.argv.includes("--no-cleanup") && !process.argv.includes("--allow-prod")) {
    throw new Error(`[assert-cleanup-plan] ${label}: --no-cleanup sólo con --allow-prod.`);
  }
  return !process.argv.includes("--no-cleanup"); // limpieza ON por defecto
}
```

2. [x] Aplicar en cada script **al inicio de `main`** (el mismo patrón, cambia la etiqueta):

```ts
// src/scripts/e2e-ai-report.ts (arriba de main)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertNotProd, assertCleanupPlan } = await import("../../scripts/lib/assert-env.mjs");
assertNotProd("e2e-ai-report");
const cleanup = assertCleanupPlan("e2e-ai-report"); // por defecto TRUE: borra lo que crea
```
   Ajustar `e2e-ai-report.ts` para que **use `cleanup`** en vez del `--cleanup` opt-out
   actual (invertir la semántica: ahora se limpia salvo `--no-cleanup`).
   Mismo cambio en `scripts/e2e/post-rls-check.mjs` (hoy default
   `https://scaudit.vercel.app` → pasar a `--allow-prod` o cambiar el default a local).

3. [x] Actualizar `package.json` para que los wrappers pasen argumentos:
   ```json
   "e2e:report": "npx tsx --env-file=.env.local src/scripts/e2e-ai-report.ts"
   ```
   (ya existente; sólo asegurar que `process.argv` llega: usar `process.argv` en ESM, no en
   el npm script).

4. [x] **TDD:** test unitario `tests/unit/assert-env.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assertNotProd, targetFromEnv } from "../../scripts/lib/assert-env.mjs";

describe("assert-not-prod", () => {
  const argv = process.argv;
  afterEach(() => { process.argv = argv; });
  it("bloquea producción sin flag", () => {
    process.env.APP_ENV = "production";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).toThrow(/PRODUCCIÓN/);
  });
  it("permite producción con --allow-prod", () => {
    process.env.APP_ENV = "production";
    process.argv = ["node", "script.ts", "--allow-prod"];
    expect(() => assertNotProd("t")).not.toThrow();
  });
  it("no bloquea development", () => {
    process.env.APP_ENV = "development";
    process.argv = ["node", "script.ts"];
    expect(() => assertNotProd("t")).not.toThrow();
    delete process.env.APP_ENV;
  });
});
```
   Ejecutar `pnpm test tests/unit/assert-env.test.ts` → verde.

**Verificación:** `pnpm test` completo en verde; `node scripts/e2e/post-rls-check.mjs` sin
flag ⇒ mensaje de bloqueo (no toca prod).

**Commit:** `feat(scripts): assert-not-prod + limpieza por defecto en e2e scripts`.

**Resultado (2026-10-11):** guarda entregada y aplicada. Detalles y desviaciones:

- `scripts/lib/assert-env.mjs` exporta `targetFromEnv({ url? })`, `assertNotProd(label, { allowFlag?, url? })` y `assertCleanupPlan(label)`.
  Detección: `APP_ENV` / `VERCEL_ENV` / `NODE_ENV` ∈ {production, prod} **o** DSN/marcador de prod (`scaudit.vercel.app`).
- **Aplicada** en: `src/scripts/e2e-ai-report.ts`, `src/scripts/e2e-adversary-flow.ts` (ambos con limpieza **ON por defecto**, antes `--cleanup` opt-in), `src/shared/db/test-rls.ts`, `scripts/manual/test-rls-root.ts`, `scripts/manual/rls-fire-test.ts` y `scripts/e2e/post-rls-check.mjs` (que además pasó su `BASE` por defecto de `https://scaudit.vercel.app` a `http://localhost:3000`).
- ⚠️ **Desviación: `src/scripts/setup-admin.ts` NO lleva guarda.** No genera datos falsos: crea el admin REAL y su vía de uso legítima *es* producción (con ella se hizo el traspaso de propiedad de D1-2). Bloquearlo impediría la operación documentada. `package.json` no necesitó cambios (el `argv` ya llega por `npx tsx`).
- 🔍 **Límite conocido:** la guarda es por variable de entorno/URL. El `DATABASE_URL` de `.env.local` apunta a la Supabase compartida y no lleva marcador de prod, así que desde local los e2e siguen pudiendo escribir en esa BD — eso lo cubre la **limpieza ON por defecto** (los scripts borran lo que crean), no la guarda. Añadir el ref de Supabase como marcador bloquearía el flujo local legítimo.
- ❗ `src/shared/db/test-rls.ts` tiene la guarda pero **no es ejecutable en pie**: importa `src/shared/db/index.ts` → `server-only`, que lanza fuera del runtime de Next (defecto preexistente, no introducido por la Fase 2).
- 🔍 Residual no tocado: `e2e/realtime-overview.spec.ts` inserta una fila en `intelligence_run_events` con el service role, pero ya **se auto-salta** sin env y **borra** la fila al terminar; no es un generador de datos demo.

---

## Task 7: `network-executors.ts` — quitar resultados inventados

**Files:** `src/server/intelligence/executors/network-executors.ts`

**Cambio (D2: sin fuente real ⇒ fallo honesto, no ficción):**

1. [x] `:147-148` — el ping **no puede** ser `Math.random()`:
   ```ts
   // ANTES (inventado)
   const latencyMs = Math.floor(Math.random() * 120) + 20;
   // DESPUÉS (honesto)
   const ranAt = Date.now();
   const probe = await realPing(target); // ejecución real; si no existe soporte, se devuelve abajo
   ```
   Como no hay sonda real disponible en el runtime de Vercel, la forma honesta es:
   ```ts
   const result = {
     success: false as const,
     tool: "ping",
     target,
     data: null,
     isFallback: true,
     error: "PING_UNAVAILABLE: el entorno de ejecución no permite medir latencia real.",
     durationMs: Date.now() - ranAt,
   };
   return result;
   ```
   **No se emite finding** por este resultado (un "ping OK" ficticio era un finding falso).
2. [x] `:33-63`, `:320-324`, `:421-431`, `:555-562` — GeoIP/ASN deterministas → devolver
   `data: null` + `isFallback: true` + `error: "GEOIP_UNAVAILABLE"`. Comprobar con
   `Select-String` que no queda ningún `country: "US"`/`asn:` constante.
3. [x] `:394-479` y finding `:490-499` — traceroute simulado → eliminar el bloque
   (el finding `high` derivado de un traceroute inventado se cae solo).
4. [x] `:812-843` — dominios `site1.<ip>.domain.net` → eliminar el bloque completo.
5. [x] `:863-910` — reputación 100/100 → `data: null` + `isFallback: true`.

**Verificación (rojo→verde):**
```powershell
Select-String -Path src\server\intelligence\executors\network-executors.ts -Pattern "Math\.random|site1\.|100/100|traceroute simulado"   # 0 hits
pnpm test           # suites de executors siguen en verde (puede que algún test mockee estos datos → actualizarlo para esperar isFallback)
npx tsc --noEmit
```
Si un test daba por bueno el valor inventado, **el test es el defecto**: cambiarlo para
esperar `isFallback: true`.

**Commit:** `fix(intelligence): network-executors sin datos inventados (fallo honesto)`.

---

## Task 8: `osint-executors.ts` — no persistir WHOIS fabricado

**Files:** `src/server/intelligence/executors/osint-executors.ts` (+ `whois-executors.ts` si aplica)

**Pasos:**

1. [x] `:55-103` — el fallback RDAP devuelve un registrador inventado y **se escribe en
   `whois_history`**. Cambiar:
   - si RDAP falla → `return { success: false, isFallback: true, error: "RDAP_UNAVAILABLE", data: null }`;
   - **no** insertar fila en `whois_history` cuando `isFallback === true`.
2. [x] `:124-126` — fechas `created/updated` sintéticas → `null` (la columna debe admitirlo;
   si no, no insertar la fila).
3. [x] `whois-executors.ts:281-328` (marcado `isFallback`) → mantener el flag, pero eliminar
   las fechas y el registrador inventados; si sólo queda un finding explicativo, conservar
   **ese** finding (es honesto: "no se pudo consultar").

**Verificación:**
```powershell
Select-String -Path src\server\intelligence\executors\*.ts -Pattern "ICANN Registrar Corp"   # 0 hits
pnpm test ; npx tsc --noEmit
```

**Commit:** `fix(intelligence): WHOIS sin registrador ni fechas inventadas`.

---

## Task 9: `ct-monitor.ts` — sin IPs `203.0.113.x`

**Files:** `src/server/intelligence/discovery/ct-monitor.ts`, `src/server/intelligence/discovery/orchestrator.ts:104-113`

**Pasos:**

1. [x] `ct-monitor.ts:49-61,150` — sustituir el rango TEST-NET-3 generado por
   `ip: null` (o `ip: undefined` + no persistir el campo) en los certs que no traigan IP real.
2. [x] `orchestrator.ts:104-113` — no guardar `ip` cuando venga vacío/sintético
   (`if (ip) { … }`).
3. [x] Añadir test: `tests/unit/ct-monitor.test.ts` debe fallar si aparece `203.0.113.` en la
   salida (incluso con `vi.mock` de la respuesta del CT log).

**Verificación:**
```powershell
Select-String -Path src\server\intelligence\discovery\*.ts -Pattern "203\.0\.113"   # 0 hits
pnpm test
```

**Commit:** `fix(discovery): certificados sin IPs de prueba fabricadas`.

---

## Task 10: `advanced-executors.ts` — sin BGP/RPKI/threat-intel simulados

**Files:** `src/server/intelligence/executors/advanced-executors.ts`

**Pasos:**

1. [x] `:27-35` + findings `:39-58` — BGP/RPKI fake con `severity: "high"` → reemplazar por
   `success:false / isFallback:true / error:"BGP_DATA_UNAVAILABLE"` y **eliminar** los
   findings generados (un hallazgo `high` basado en datos inventados es el peor tipo de falso).
2. [x] `:79-110` — threat-intel `critical` fake → idem (`THREAT_INTEL_UNAVAILABLE`).
3. [x] Buscar otros findings generados en este fichero con valores de ejemplo y aplicar la
   misma regla:
   ```powershell
   Select-String -Path src\server\intelligence\executors\advanced-executors.ts -Pattern "severity:|severity =" | ForEach-Object { $_.LineNumber.ToString() + ": " + $_.Line.Trim() }
   ```

**Verificación:** `pnpm test` + `npx tsc --noEmit`; grep de literales de ejemplo en 0 hits.

**Commit:** `fix(intelligence): executors avanzados sin findings fabricados`.

---

## Task 11: `scenario-runner.ts` — el cron deja de escribir simulación

**Files:** `src/server/intelligence/adversary/scenario-runner.ts`,
`src/trigger/adversary.trigger.ts:26-28`

**Pasos:**

1. [x] Decisión D2 aplicada al sandbox adversarial: **si el escenario es simulado, no se
   ejecuta** (no run ⇒ no output ⇒ no findings `[SIM]`):
   ```ts
   // scenario-runner.ts — al inicio de run()
   if (scenario.mode === "simulated" && !process.env.ALLOW_SIMULATED_SCENARIOS) {
     return {
       status: "skipped",
       reason: "SIMULATED_SCENARIOS_DISABLED: los escenarios simulados no generan datos persistidos.",
     };
   }
   ```
   Eliminar `generateSimulatedOutput` (`:132-206`) y el bloque que inserta el output + findings.
2. [x] `adversary.trigger.ts:26-28` — el cron de 6h debe pasar a `mode: "live"` o
   desactivarse (`if (!live) return skip`). Confirmar con el usuario si el cron se apaga
   (recomendado hasta tener credenciales de escenarios reales).
3. [x] Borrar los tests que assertaban findings `[SIM]`.

**Verificación:** `Select-String -Path src\server\intelligence\adversary\*.ts -Pattern "generateSimulatedOutput|\[SIM\]"` → 0 hits; `pnpm test`.

**Commit:** `fix(adversary): escenarios simulados ya no persisten runs ni findings`.

---

## Task 12: Borrar la ruta mock `/api/intelligence/graph` y hacer honesto el grafo

**Files:** `src/app/api/intelligence/graph/route.ts` (borrar), `src/app/api/intelligence/graph/route.test.ts` (borrar/ajustar),
`src/features/dashboard/AttackSurfaceGraph.tsx` (edit) ⚠️ **WIP: ejecutar `git status --porcelain src/features/dashboard` antes; si hay cambios sin commitear → pausar y pedir confirmación.**

**Contexto verificado:**
- Existe un endpoint **real** `GET /api/intelligence/assets/graph?projectId=…`
  (`src/app/api/intelligence/assets/graph/route.ts`) que devuelve `nodes`/`edges` desde
  `intelligence_assets` + `intelligence_findings` con `withRLS`.
- `AttackSurfaceGraph.tsx:65-66` declara `dynamicNodes/dynamicEdges`; **único** setter =
  `handleNodeClick` (`:145-170`), que hace
  `fetch(\`/api/intelligence/graph?nodeId=${…}\`)` y pinta nodos sintéticos en
  `x: 65 + i * 15, y: 75 + i * 80` (`:162-166`).

**Pasos:**

1. [x] Confirmar que no hay otros consumidores de la ruta mock:
   ```powershell
   Select-String -Path (Get-ChildItem -Recurse -Include *.ts,*.tsx src,e2e,tests | Select-Object -ExpandProperty FullName) -Pattern "intelligence/graph" | ForEach-Object { $_.Path + ":" + $_.LineNumber }
   ```
   (esperado: sólo `AttackSurfaceGraph.tsx`, `graph/route.ts`, `graph/route.test.ts`).
2. [x] Reemplazar `handleNodeClick` — sin fetch sintético; la selección sólo resalta vecinos
   **ya cargados** en el grafo real (`ns`/`es` de este componente, o el grafo de
   `assets/graph` si el componente lo recibe por props):

```tsx
// AttackSurfaceGraph.tsx — sustituye el cuerpo de handleNodeClick (líneas ~145-170)
const handleNodeClick = (nodeId: string) => {
  setHoveredNodeId((prev) => (prev === nodeId ? null : nodeId));
  // Sin expansión sintética: los vecinos visibles salen de las aristas reales
  // ya cargadas (props/graph). No se llama a /api/intelligence/graph (ruta eliminada).
  const neighbours = new Set<string>();
  for (const e of es) {
    if (e.from === nodeId) neighbours.add(e.to);
    if (e.to === nodeId) neighbours.add(e.from);
  }
  setHighlightedIds(neighbours);
};
```
   > `es` es la lista de aristas del render (`:53`); si el estado interno se llama
   > distinto, adaptar el nombre — la regla es **no** inventar nodos nuevos. Si hace falta
   > estado nuevo, declararlo junto a `:65`:
   > `const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());`
3. [x] Borrar `src/app/api/intelligence/graph/route.ts` y `route.test.ts`
   (`git rm` cuando el usuario autorice el commit).
4. [x] Verificar que `dynamicNodes/dynamicEdges` quedan **sin fuente de escritura** →
   borrarlos también (`:65-66` y sus usos en el `useMemo` `:148-149`) para que no quede
   estado muerto.

**Verificación:**
```powershell
Select-String -Path src -Pattern "intelligence/graph\?nodeId"      # 0 hits
pnpm lint ; npx tsc --noEmit ; pnpm test ; pnpm build
```

**Commit:** `refactor(intelligence): eliminar grafo mock; selección de nodo honesta`.

---

## Resultado Fase 2 — Tasks 7-11 ejecutadas (2026-10-11)

Regla aplicada en todo el barrido: **sin fuente real ⇒ fallo honesto** (`success: false` +
`isFallback`/`error`), nunca un dato de relleno. Un `null` es honesto; un valor inventado, no.

| Task | Archivo | Qué se eliminó | Sustituido por |
|---|---|---|---|
| 7 | `executors/network-executors.ts` | `getLocalGeoIPFallback` (país/ciudad/ASN/ISP/coords por hash); latencia `Math.random` del ping; traza inventada (gateway `192.168.x`, backbone `10.x`, hops y latencias derivadas de la latitud); ASN por defecto de Google; dominios co-alojados `site1.<ip>.domain.net`; reputación "limpia" con listas negras ficticias | `PING_UNAVAILABLE` / `GEOIP_UNAVAILABLE` / `TRACEROUTE_UNAVAILABLE` / `ASN_DATA_UNAVAILABLE` / `REPUTATION_UNAVAILABLE` sin findings; `latitude`/`longitude`/`port`/`reputationScore` a `null`; PTR reales o `[]` |
| 8 | `executors/osint-executors.ts`, `executors/whois-executors.ts` | WHOIS inventado (registrador ficticio, alta −5 años, expiración +90 días, `daysRemaining: 90`, `status: ["active"]`, `ns1/ns2.host.com`) **persistido en `whois_history`** con alertas de cambio incluidas; y fechas sintéticas cuando RDAP no traía eventos | `RDAP_UNAVAILABLE` sin estimación ni snapshot; `createdDate`/`expiresDate`/`daysRemaining` a `null` (el fallback conserva `isFallback` + el finding explicativo) |
| 9 | `discovery/ct-monitor.ts` | IP determinista por hash en rango TEST-NET-3 persistida en `intelligence_assets.ip` | `ip: null` (crt.sh no aporta IPs) |
| 10 | `executors/advanced-executors.ts` | BGP inventado (bloque de documentación, ASN de ejemplo, `rpkiStatus: invalid`) + hallazgo `high` derivado; threat-intel `critical` por nombre de dominio con feeds inexistentes | `BGP_DATA_UNAVAILABLE` / `THREAT_INTEL_UNAVAILABLE` con `isFallback: true` y **cero findings** |
| 11 | `adversary/scenario-runner.ts`, `trigger/adversary.trigger.ts` | Transcript decorativo de "simulación" + hallazgo `[SIM]` con `evidence.sandbox: null` + run cerrada como `missed` para escenarios que **nunca se ejecutaron** | Sin ejecución real (y no manual) ⇒ `skipped: true`, **sin run, sin output, sin findings**; con ejecución ⇒ run con transcript real y hallazgo `[ADV]`; escenarios `manual` ⇒ run con la referencia del comando, sin findings; el trigger cuenta `skipped` aparte (no como fallo de detección) |

**Tests actualizados** (dependían de los datos ficticios): `executors/executors.test.ts` (3 casos
reescritos: rama "sin API" y rama "con API real" mockeando `safeFetch`), `adversary/scenario-runner.test.ts`
(3 casos: manual sin findings, `[ADV]` en vez de `[SIM]`, y `skipped` sin run). `trigger/adversary.trigger.test.ts`
seguía verde sin cambios.

**Verificación:** `git grep` de `Math.random|ICANN Registrar Corp|site1\.|203\.0\.113|192\.0\.2\.|100/100|generateSimulatedOutput|\[SIM\]|getLocalGeoIPFallback` en `src/**` → **0 hits reales** (sólo quedan los `Math.random` de UI decorativa y el del grafo mock, y las NOTA de este barrido). `npx tsc --noEmit` → exit 0. `eslint --max-warnings=0` sobre los ficheros tocados → exit 0. Suites afectadas en verde.

**Fuera de alcance (pendiente, ya planificado):** Task 12 (ruta mock `intelligence/graph`) y Fase 3
(UI sin teatro: `AuditControl.tsx` con progreso aleatorio, `IntelligenceTab.tsx` con "velocidad"
aleatoria, estados vacíos que afirman timeout/traza en curso).

---

# Fase 3 — UI sin teatro

> Recordatorio: todas estas tareas tocan `src/features/dashboard/**` y/o `src/components/**`
> (WIP ajeno). Ejecutar `git status --porcelain src/features/dashboard src/components` antes
> de cada una y **pausar si hay cambios sin commitear**.

## Task 13: `useAiChat` → conversación real con `/api/ai/copilot`

**Files:** `src/features/intelligence/hooks/useAiChat.ts`, nuevo `tests/unit/use-ai-chat.test.ts`

**Contexto verificado:** `POST /api/ai/copilot` acepta
`{ messages: [{ role, content }], context?, mode? }` y responde `{ success, message }`
(≤5 req/min por usuario, cuota diaria, `maxDuration: 120`).

**Pasos (TDD):**

1. [ ] **Rojo** — crear `tests/unit/use-ai-chat.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAiChat } from "@/features/intelligence/hooks/useAiChat";

describe("useAiChat — sólo mensajes reales", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, message: "respuesta real" }) })); });
  afterEach(() => vi.unstubAllGlobals());

  it("sendMessage llama a /api/ai/copilot y añade la respuesta del servidor", async () => {
    const { result } = renderHook(() => useAiChat());
    await act(async () => { await result.current.sendMessage("analiza target.example"); });
    expect(fetch).toHaveBeenCalledWith("/api/ai/copilot", expect.objectContaining({ method: "POST" }));
    const msgs = result.current.messages;
    expect(msgs[msgs.length - 1]).toEqual({ role: "assistant", text: "respuesta real" });
    expect(result.current.isGenerating).toBe(false);
  });

  it("en error NO inventa respuesta: muestra mensaje de fallo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const { result } = renderHook(() => useAiChat());
    await act(async () => { await result.current.sendMessage("hola"); });
    const msgs = result.current.messages;
    expect(msgs[msgs.length - 1].text).toMatch(/no se pudo|error/i);
  });
});
```
2. [ ] Ejecutar `pnpm test tests/unit/use-ai-chat.test.ts` → **rojo**.
3. [ ] **Verde** — sustituir `sendMessage` (`:25-40` y el `setTimeout` guionizado):

```ts
const sendMessage = useCallback(async (text: string) => {
  const userText = text.trim();
  if (!userText) return;

  setMessages((prev) => [...prev, { role: "user", text: userText }]);
  setIsGenerating(true);
  try {
    const res = await fetch("/api/ai/copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [...messages, { role: "user", content: userText }]
          .map((m) => ({ role: m.role, content: m.text })),
        mode: "chat",
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data?.error || `HTTP ${res.status}`);
    }
    setMessages((prev) => [...prev, { role: "assistant", text: data.message }]);
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", text: `No se pudo obtener respuesta del copiloto (${err instanceof Error ? err.message : "error"}). Inténtalo de nuevo.` },
    ]);
  } finally {
    setIsGenerating(false);
  }
}, [messages]);
```
   - Ajustar la firma de `UseAiChatReturn.sendMessage` a `Promise<void>` y actualizar llamadores
     (`grep -n "sendMessage(" src` → `void sendMessage(...)` si hace falta).
   - `requestRemediationPlan` (`:44+`) ya usa `fetch` real → conservar.
   - Estado de "generando": deshabilitar el input mientras `isGenerating` (mirar el
     componente consumidor) y, si el backend devuelve 429 por cuota, mostrar el mensaje tal cual.
4. [ ] Ejecutar el test → verde.

**Verificación:** `Select-String -Path src\features\intelligence\hooks\useAiChat.ts -Pattern "setTimeout|Simulate"` → 0 hits; `pnpm test`, `npx tsc --noEmit`, `pnpm lint`.

**Commit:** `feat(intelligence): chat conectado al copiloto real (sin respuestas guionizadas)`.

---

## Task 14: `IntelligenceShell` / `TelemetryTimeline` / `EvidencesList` → estado vacío honesto

**Files:** `src/features/intelligence/components/IntelligenceShell.tsx`,
`…/TelemetryTimeline.tsx`, `…/EvidencesList.tsx`

**Pasos:**

1. [ ] Borrar `DEMO_EVENTS` (`IntelligenceShell:36`), `DEMO_EVIDENCES` (`:43`), los mensajes
   copilot fake (`:85-91`, `:127-132`) y el título `Onboarding-Demo` (`:102`).
2. [ ] Sustituir los usos (`:258`, `:267-268`, `:277-278`) por datos reales si llegan por
   props/contexto; si no hay fuente:
   ```tsx
   {events.length === 0 && (
     <p className="text-sm text-[var(--color-foreground-muted)]">
       Sin eventos todavía. Los eventos aparecerán cuando ejecutes una investigación.
     </p>
   )}
   ```
3. [ ] `TelemetryTimeline.tsx:33,42,46` y `EvidencesList.tsx:34,43,47`: eliminar arrays de
   demo → render condicional sobre `events`/`evidences` **props** (vacío = mensaje honesto,
   no `fallback` inventado).
4. [ ] Borrar `simulateConsoleLogs` de importaciones cruzadas si existen.

**Verificación:** `Select-String -Path src\features\intelligence -Pattern "DEMO_EVENTS|DEMO_EVIDENCES"` → 0; `pnpm test`, `pnpm lint`, `pnpm build`.

**Commit:** `feat(intelligence): shell/timeline/evidencias con estado vacío honesto`.

---

## Task 15: `IntelligenceTab` + `CopilotConsole` → progreso real, sin `Math.random`

**Files:** `src/features/dashboard/tabs/IntelligenceTab.tsx`,
`src/features/dashboard/tabs/intelligence/CopilotConsole.tsx` ⚠️ **WIP: comprobar `git status` primero.**

**Pasos:**

1. [ ] `IntelligenceTab.tsx:194-245` — borrar `simulateConsoleLogs` (todo el bloque) y
   `:229` (`Math.random` KB/s). La consola sólo debe mostrar logs reales provenientes de la
   ejecución (`tool_runs` / respuestas de `/api/intelligence/runs`).
2. [ ] `:294-314` — pasos del copilot con `setTimeout(3600)`: sustituir por el estado real
   (`isPending/isRunning` de la mutación) y, mientras carga, un loader neutro
   (sin frases que afirmen actividad: "Analizando…", "Consultando fuentes…").
3. [ ] `CopilotConsole.tsx:40-46,182` — `COPILOT_STEPS` → lista de estados vacíos/real:
   ```tsx
   const steps = runs.length ? runs.map((r) => ({ label: r.tool, status: r.status })) : [];
   ```

**Verificación:**
```powershell
Select-String -Path src\features\dashboard\tabs -Pattern "Math\.random|simulateConsoleLogs|COPILOT_STEPS"   # 0 hits
pnpm test ; npx tsc --noEmit
```

**Commit:** `fix(dashboard): consola y pasos del copiloto sin simulación`.

---

## Task 16: `MonitoringTab` + `AuditControl` → alertas y progreso reales

**Files:** `src/features/dashboard/tabs/MonitoringTab.tsx`, `…/AuditControl.tsx` ⚠️ **WIP.**

**Pasos:**

1. [ ] `MonitoringTab.tsx:246-255,350-361,399-407` — alertas de ejemplo y "test de Slack"
   que devuelve éxito falso → sustituir por:
   - alertas reales de `/api/monitoring` (o lista vacía honesta);
   - el test de Slack: llamar al endpoint real y pintar su resultado **tal cual** (si
     devuelve error, se muestra error; nada de "✅ enviado" sin respuesta).
2. [ ] `AuditControl.tsx:61-81` — progreso con `Math.random()` → usar el progreso real de la
   ejecución (`completedSteps/totalSteps`) o, sin ejecución, `0%` + estado "no iniciado".

**Verificación:**
```powershell
Select-String -Path src\features\dashboard\tabs\MonitoringTab.tsx -Pattern "Math\.random|setTimeout"   # 0 hits
Select-String -Path src\features\dashboard\tabs\AuditControl.tsx -Pattern "Math\.random"               # 0 hits
pnpm test
```

**Commit:** `fix(dashboard): alertas y progreso sin datos fabricados`.

---

## Task 17: Paneles con claims hardcodeados → honestos

**Files:** `src/features/intelligence/components/NetworkOsintSection.tsx`,
`src/features/intelligence/components/MailSecurityPanel.tsx`, `src/features/dashboard/QuickMetricsHud.tsx`,
`src/features/dashboard/GeoMap.tsx`, `src/features/dashboard/ProjectCard.tsx`

**Pasos:**

1. [ ] `NetworkOsintSection.tsx:416-424` — fallback DNSBL "Seguro" → `"Sin datos"`:
   ```tsx
   const dnsblLabel = dnsbl?.checked
     ? (dnsbl.listed === 0 ? "Sin detecciones" : `Listado en ${dnsbl.listed} listas`)
     : "Sin datos de DNSBL";
   ```
   (nunca "Seguro" sin comprobación real).
2. [ ] `MailSecurityPanel.tsx:434` — TLS hardcodeado → valor del registro real o
   `"No verificado"`.
3. [ ] `QuickMetricsHud.tsx:22,32` — claims de texto ("protegido", "actual") → derivados de
   datos o `"—"`.
4. [ ] `GeoMap.tsx:92-96` — coordenadas de relleno → si no hay geolocalización real, ocultar
   el marcador (`return null`), no pintar un punto en el mar.
5. [ ] `ProjectCard.tsx:46-47,73-75` — badge "Demo": tras la purga no quedan proyectos demo →
   eliminar el badge (código muerto) **o** conservarlo sólo si `domain` matchea `example.*`
   (recomendado: eliminar).
6. [ ] Búsqueda de claims restantes:
   ```powershell
   Select-String -Path src -Pattern "TODO ficticio|HARD_CODED|hardcodead|Mock data|datos de ejemplo" -Include *.tsx -Exclude *.test.tsx
   ```

**Verificación:** `pnpm lint`, `pnpm test`, `pnpm build`.

**Commit:** `fix(ui): claims y marcadores sin datos inventados`.

---

# Fase 4 — Guardas para que no vuelva a entrar

## Task 18: Guard estático `pnpm guard:fakedata`

**Files:** `scripts/guard-fake-data.mjs` (nuevo), `scripts/db/fake-data-policy.json` (nuevo),
`package.json`

**Interfaces:** `node scripts/guard-fake-data.mjs` → exit 0 = OK, 1 = violación (patrón de
`scripts/guard-client-secrets.mjs`: ROOT resuelto desde `import.meta.url`, recorrido de
`src/` excluyendo tests, lista de allowlist explícita).

**Pasos:**

1. [ ] `scripts/db/fake-data-policy.json` (versionada y editable sin tocar código):
```json
{
  "deny": [
    { "id": "math-random-data", "pattern": "Math\\.random\\(\\)",
      "scope": ["src/app", "src/features", "src/server", "src/components"],
      "allow": ["src/components/NeuralNetworkBackground.tsx", "src/app/api/looker-studio/route.ts"] },
    { "id": "demo-markers", "pattern": "DEMO_EVENTS|DEMO_EVIDENCES|simulateConsoleLogs|COPILOT_STEPS|generateSimulatedOutput|SEED_PHANTOM",
      "scope": ["src"], "allow": [] },
    { "id": "testnet-ip", "pattern": "203\\.0\\.113\\.", "scope": ["src", "scripts"], "allow": [] },
    { "id": "fake-registrar", "pattern": "ICANN Registrar Corp", "scope": ["src", "scripts"], "allow": [] },
    { "id": "synthetic-domain", "pattern": "site1\\.<|domain\\.net", "scope": ["src/server"], "allow": [] }
  ],
  "denyFiles": ["src/shared/db/seed.ts"],
  "allowFiles": ["**/*.test.ts", "**/*.test.tsx", "**/__mocks__/**", "tests/**", "e2e/**"]
}
```
2. [ ] `scripts/guard-fake-data.mjs` (mismo esqueleto que `guard-client-secrets.mjs`):
```js
#!/usr/bin/env node
/**
 * Guard de datos falsos: FALLA el CI/pnpm si reaparece un patrón de simulación.
 * Uso: node scripts/guard-fake-data.mjs   (exit 0 OK / 1 violación)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/db/fake-data-policy.json"), "utf8"));

const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    if (policy.allowFiles.some((g) => glob(rel, g))) continue;
    const src = fs.readFileSync(full, "utf8");
    for (const rule of policy.deny) {
      if (!rule.scope.some((s) => rel.startsWith(s))) continue;
      if (rule.allow.includes(rel)) continue;
      const re = new RegExp(rule.pattern);
      src.split("\n").forEach((line, i) => {
        if (re.test(line)) violations.push({ rel, line: i + 1, id: rule.id, text: line.trim().slice(0, 100) });
      });
    }
  }
}

function glob(str, g) {
  const rx = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${rx}$`).test(str);
}

for (const f of policy.denyFiles) if (fs.existsSync(path.join(ROOT, f))) violations.push({ rel: f, line: 0, id: "deny-file", text: "el fichero no debe existir" });

walk(path.join(ROOT, "src"));
walk(path.join(ROOT, "scripts"));

if (violations.length) {
  console.error("guard:fakedata ✗ — patrones de datos falsos detectados:");
  for (const v of violations) console.error(`  ${v.rel}:${v.line} [${v.id}] ${v.text}`);
  process.exit(1);
}
console.log("guard:fakedata ✓ — sin patrones de datos falsos.");
process.exit(0);
```
3. [ ] `package.json`: `"guard:fakedata": "node scripts/guard-fake-data.mjs"`.
4. [ ] **TDD (rojo):** crear temporalmente un fichero con `Math.random()` dentro de
   `src/features/` → `pnpm guard:fakedata` ⇒ exit 1; borrarlo ⇒ exit 0.
5. [ ] Ejecutar contra el árbol limpio esperando **rojo** si aún queda algún patrón de las
   Fases 2-3 sin terminar (ese rojo es el listado de pendientes real).

**Verificación:** `pnpm guard:fakedata` → exit 0 con el árbol limpio.

**Commit:** `feat(guards): guard estático contra datos falsos (pnpm guard:fakedata)`.

---

## Task 19: Guardas en CI y pre-commit

**Files:** `.github/workflows/ci.yml`, `.githooks/pre-commit`, `package.json`

**Pasos:**

1. [ ] En `ci.yml`, añadir el guard al job existente `lint-and-build` (junto a
   `guard:secrets` / `guard:cdn` / `guard:i18n` — localiza el bloque con
   `Select-String -Path .github\workflows\ci.yml -Pattern "guard:"`):
   ```yaml
   - name: Guard datos falsos (estático)
     run: pnpm guard:fakedata
   ```
2. [ ] Nuevo job `fake-data-audit` (patrón de `db-drift-check`, líneas 168-210: **se salta con
   warning si falta el secreto**):
   ```yaml
     fake-data-audit:
       name: Fake Data Audit (prod, read-only)
       runs-on: ubuntu-latest
       needs: [lint-and-build]
       if: github.event_name == 'push' && github.ref == 'refs/heads/main'
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: pnpm }
         - run: pnpm install --frozen-lockfile
         - name: Auditar datos falsos en BD
           env:
             DATABASE_URL: ${{ secrets.DATABASE_URL }}
           run: |
             if [ -z "$DATABASE_URL" ]; then
               echo "::warning::DATABASE_URL no disponible; audit omitido"
               exit 0
             fi
             node scripts/db/fake-data-audit.mjs --fail-on-error
   ```
3. [ ] `.githooks/pre-commit`: ampliar el filtro de "cambios relevantes" (línea 22) para que
   también corra cuando cambien `scripts/guard-fake-data.mjs`,
   `scripts/db/fake-data-policy.json`, `src/shared/db/seed.ts` o `src/**/*executor*`:
   ```sh
   if ! git diff --cached --name-only | grep -qE '(^docs/architecture/.*\.md$|^scripts/quality-gate\.mjs$|^scripts/guard-fake-data\.mjs$|^scripts/db/fake-data-.*$|^src/server/intelligence/)'; then
     exit 0
   fi
   ```
   y añadir, tras el gate de docs:
   ```sh
   node scripts/guard-fake-data.mjs || exit 1
   ```
4. [ ] Añadir el job Newman una guarda de entorno: en `api-contract-test` (líneas 256-315)
   restringir a `main` con entorno explícito o pasar `--allow-prod` sólo ahí:
   ```yaml
   - name: Contract test (escribe sólo con entorno declarado)
     env:
       APP_ENV: production   # explícito: el job SABE que toca prod y lo declara
   ```
   (Si el usuario prefiere evitar escrituras en prod en CI: crear `SCAUDIT_API_KEY` de sólo
   lectura o una BD de staging — decisión **pendiente**, marcar como follow-up en Task 21.)

**Verificación:** `bash .githooks/pre-commit` con un archivo staged de `src/server/intelligence/`
→ ejecuta el guard; `pnpm guard:fakedata` en verde. (La validación real del workflow ocurre en
CI tras el push — **no se pusha sin orden**.)

**Commit:** `ci(guards): fake-data-audit en CI + guard en pre-commit`.

---

## Task 20: Política versionada (para que nadie "vuelva a inventar")

**Files:** `docs/architecture/DATA-INTEGRITY.md` (nuevo, gate ≥80), referencia en
`docs/superpowers/MASTER-INDEX.md`, `.env.example` (si existe) o `README` de scripts.

**Pasos:**

1. [ ] Escribir `docs/architecture/DATA-INTEGRITY.md` con: (1) qué cuenta como dato falso,
   (2) inventario de lo purgado (enlace a este plan + snapshot en `backups/`),
   (3) regla D2 (sin fuente real ⇒ `isFallback:true` + `data:null`, **nunca** un finding),
   (4) regla D3 (scripts con `assertNotProd`; e2e con limpieza por defecto),
   (5) cómo correr `pnpm db:fake-audit` y `pnpm guard:fakedata`,
   (6) excepciones KEEP y cómo pedirlas (allowlist, con fecha y justificación).
2. [ ] Pasarlo por el gate obligatorio:
   ```powershell
   node scripts/quality-gate.mjs docs/architecture/DATA-INTEGRITY.md --min 80
   ```
   (tiene que dar ≥80 antes del commit; el pre-commit lo bloquea si no).
3. [ ] Añadir la entrada en `docs/superpowers/MASTER-INDEX.md`.

**Verificación:** `node scripts/quality-gate.mjs docs/architecture/DATA-INTEGRITY.md --min 80` → exit 0.

**Commit:** `docs: política de integridad de datos (anti-datos-falsos)`.

---

## Task 21: Verificación final end-to-end

**Files:** ninguno

**Pasos (en este orden, guardando salida de cada uno):**

1. [ ] `pnpm guard:fakedata` → exit 0.
2. [ ] `node scripts/db/fake-data-audit.mjs` → **exit 0** (DELETE=0; REVIEW sólo de lo aprobado,
   añadido a KEEP).
3. [ ] `npx tsc --noEmit` → 0 errores.
4. [ ] `pnpm lint` → 0 errores.
5. [ ] `pnpm test` → todos en verde (los tests que assertaban datos inventados ya están
   actualizados a `isFallback`/estado vacío).
6. [ ] `pnpm build` → exit 0.
7. [ ] `pnpm guard:secrets && pnpm guard:cdn && pnpm guard:i18n` → en verde (sin regresiones).
8. [ ] Smoke E2E contra build de producción (continúa el trabajo previo): regenerar baselines
   visuales y correr `smoke-prod4` con la config temporal
   (`C:\Users\Juan\AppData\Local\Temp\opencode\playwright.prod.config.ts`) → **16/16**.
   ```powershell
   node --env-file=.env.local node_modules\playwright\cli.js test --config "$env:TEMP\opencode\playwright.prod.config.ts" --update-snapshots
   node --env-file=.env.local node_modules\playwright\cli.js test --config "$env:TEMP\opencode\playwright.prod.config.ts"
   ```
9. [ ] Reporte final: tabla de gates con la salida real de cada comando (evidencia, no
   afirmaciones).

**Criterio de DONE:** 1-7 en verde ahora mismo; 8 en verde (16/16) como parte del trabajo de
smoke pendiente; commit/push **sólo** con orden explícita.

---

## Riesgos y pendientes abiertos

| Riesgo | Mitigación |
|---|---|
| Borrar un proyecto/usuario real (Pipeline Test, admin@strategicaudit.pro) | dry-run + aprobación explícita (Task 3.3); REVIEW nunca se borra automáticamente |
| Romper el gate de smoke (usuario E2E) | `KEEP` allowlist: `smoke-test@strategicconnex.test` |
| Colisión con WIP sin commitear en `src/features/dashboard/**` y `src/components/**` | `git status --porcelain` antes de cada tarea 12-17; pausar y preguntar |
| Cascada FK no contemplada en la purga | introspección de `pg_constraint` + una sola transacción + backup completo previo (si un hijo sin CASCADE impide el borrado, hay `ROLLBACK` total en vez de purga parcial) |
| ~~Drift duro preexistente: 5 tablas del schema sin crear~~ | **RESUELTO (2026-10-11).** `pnpm db:migrate` aplicó las 5 migraciones pendientes y `db:drift-check` sale exit 0. Las migraciones eran idempotentes por diseño (`IF NOT EXISTS`), así que 3 de ellas ya estaban aplicadas a mano y sólo faltaba el registro en el ledger |
| ~~Purga bloqueada por `NO ACTION` (`audit_logs`/`audits`/`reports`) y por cascada sobre 1.372 filas no candidatas~~ | **RESUELTO (2026-10-11).** La regla project-scoped (decisión del operador) mete esas filas en el alcance declarado: el dry-run sale limpio, exit 0. Si apareciera una cascada nueva, el script sigue abortando por diseño y la salida es declarar la tabla o usar `--accept-cascade` explícito (decisión del operador, no del agente) |
| Borrar `admin@strategicaudit.pro` habría cascada-do 4-5 proyectos reales (D1-2) | **RESUELTO (2026-10-11)** por traspaso de los 4 proyectos reales al admin con login (registro reversible en `backups/d1-2-owner-reassignment-*.json`); verificado que la cuenta original ya sólo posee el proyecto demo |
| Una tabla nueva con `project_id` o con `ON DELETE CASCADE` hacia una fila candidata entra en el alcance sin que nadie lo decida | La política está declarada en `scripts/lib/fake-data-patterns.mjs` y los dos scripts comparan lo declarado con lo descubierto en la BD: la purga rechaza el `--apply` (`notDeclaredCascade`) y el auditor lo avisa |
| Backup **sólo-datos** (sin DDL ni `auth.users`) | Restaurar reinyectando los INSERT con el schema ya migrado; para un dump desde cero, generar DDL aparte (`pg_dump --schema-only`) |
| CI sigue escribiendo en prod (Newman) | decisión pendiente: API key de sólo lectura o BD de staging (Task 19.4) |
| Crons Trigger.dev siguen activos (`adversary.trigger` 6h) | Task 11 desactiva la simulación; verificar en dashboard de Trigger.dev que no quedan runs |

---

## P0.5 — Placeholder + integridad referencial (2026-10-12)

**Contexto.** Con la Fase 1 cerrada (`DELETE=0`) el auditor seguía en verde, pero
el operador pidió purgar `ops`/`runrun`, los usuarios sintéticos y los 217
huérfanos de `intelligence_run_events`. Una sonda **read-only** de la BD
contradijo parte de la premisa: `ops` (opssrl.com.ar) y `runrun`
(runrunenergetico.com) son **proyectos ACTIVOS con 2 988 chequeos de uptime
reales cada uno** (sep-2026, latencias variadas 17–426 ms, status 200) y
`runrun`, `strategic connex` y `Strategic Connex COM AR` eran **los proyectos
reales que D1-2 había conservado por traspaso**. El agente **paró y pidió
decisión explícita** en vez de ejecutar la premisa.

**Decisión del operador (2026-10-12).** PURGAR `runrun`, `strategic connex` y
`Strategic Connex COM AR` (**override explícito de D1-2**), más los usuarios
sintéticos `dev@localhost.dev` y `e2e.rls.*`; **NO** tocar `ops`; aplicar 0043
tras backup.

**Ejecutado.** (1) Política ampliada (`synthetic-user`, `PLACEHOLDER_PROJECT_NAMES`
por igualdad exacta contra `name`, huérfanos inversos) + regresión
`tests/db/fake-data-policy.test.ts` (12/12). (2) Bug del mapa
`pg_constraint.confdeltype` corregido (un `SET NULL` se leía como bloqueo duro).
(3) `drizzle/0043_intelligence_run_events_fk.sql`: 217 huérfanos fuera y las 2 FK
del schema creadas (`run_events` 417→200, 0 huérfanos). (4) Backup
(7 327 336 bytes) → `--apply` → **8 985 filas** en una transacción → auditor
**`DELETE=0  REVIEW=0`**.

**Efecto colateral aceptado.** Los 3 `audit_logs` que apuntan al usuario
`e2e.rls.*` (logs de error del propio E2E) quedan con `user_id = NULL`
(`ON DELETE SET NULL`, la conducta que el schema pidió); no se borran.

**Cerrado en P0.5-E/F (2026-10-12).** El barrido real fue **más grande que la
premisa**: un guard nuevo (`scripts/db/fk-schema-drift-guard.mjs`) midió
**93 FK declaradas en el schema contra 82 existentes en la BD → 11 ausentes**,
no las 3 previstas. Además de las tres `investigation_id` de `intelligence_*`
faltaban `whois_history`, `anomaly_detections`, y **cinco de la familia
`adversary_*`** — incluida `adversary_engagements.project_id`, con la tabla
padre sin ninguna FK.

**Ejecutado (P0.5-E).** `drizzle/0044_restore_missing_fks.sql` (journal `idx 55`,
ledger 56): **250 huérfanos re-parentados a NULL** por las columnas nullable
(`intelligence_tool_runs` 147 de 330 filas · `intelligence_findings` 102 de 149 ·
`intelligence_assets` 1 de 7) y **ninguna fila borrada**; las otras 8 tablas
estaban vacías (0 huérfanos, `DELETE` inerte sobre las 2 columnas NOT NULL) y ya
tienen su FK. Verificado tras aplicar: **0 huérfanos**, **93/93 FK** en
`pg_constraint`, totales intactos (330/149/7).

**Desviación de la instrucción (documentada).** La orden pedía `ON DELETE SET
NULL` en las tres `investigation_id` nullable; el **schema** de Drizzle declara
`cascade` en las tres (`src/shared/db/schemas/intelligence.ts`). Se aplicó lo que
dice el schema: usar `SET NULL` habría creado un drift de ACCIÓN recién nacido y
habría hecho fallar el guard nuevo. **Queda como pregunta de producto** si
borrar una investigación debe llevarse sus tool_runs/findings/assets (CASCADE,
estado actual) o desvincularlos (SET NULL, que exige cambiar el schema primero).

**Ejecutado (P0.5-F).** Guard estático+BD `scripts/db/fk-schema-drift-guard.mjs`
(`pnpm db:fk-guard`, solo `SELECT`, exit 2 si no puede verificar) que convierte
las FK en chequeo **duro** — `drift-check.mjs` las trata como adhesivas y por eso
el defecto duró meses sin poner CI en rojo. Enganchado en `ci.yml` (job
`db-drift-check`) y en el chequeo diario `db-drift.yml`; regresión estática
`tests/db/fk-drift-guard.test.ts` (7/7). Estado tras el arreglo: **exit 0**.

---

## P0.5-I — Decisión de producto: SET NULL (2026-10-12)

**Decisión del operador.** La pregunta de producto que quedó abierta en
P0.5-E/F se resolvió **a favor de la trazabilidad**: en un sistema de auditoría
un hallazgo, una ejecución de herramienta y un activo descubierto tienen valor
forense propio, así que **sobreviven** al borrado de la investigación que los
originó. CASCADE habría quemado esos expedientes al archivar una investigación.

**Ejecutado (P0.5-I-A/B).** El schema (`src/shared/db/schemas/intelligence.ts`)
pasa las tres FK nullable de `cascade` a `set null`; `intelligence_run_events`
se queda en `cascade` porque su `investigation_id` es **NOT NULL** (ahí SET NULL
es imposible). `drizzle/0045_intelligence_set_null_on_delete.sql` (journal
`idx 56`, ledger 57) alinea la BD tras backup
(`backups/strategic_audit_pro_backup_2026-10-12T12-57-07-656Z.sql`, 4 710,83 KB)
y dry-run en transacción con `ROLLBACK` (6 sentencias OK). Verificado tras
aplicar: `confdeltype='n'` en las tres, **93 FK** en `pg_constraint` (sin
duplicados), **0 huérfanos** y totales intactos (330/149/7); el guard de FK
sigue en **exit 0** (93 declaradas = 93 en BD). Los `DROP CONSTRAINT IF EXISTS`
usan el nombre REAL truncado a 63 bytes por Postgres **y** el alternativo
`_fkey`, así que re-ejecutar la migración es idempotente.

**Alcance real (no vender de más).** Las tres tablas también cascada desde
`projects` por su `project_id NOT NULL`, de modo que **borrar un proyecto
entero las sigue borrando**: el cambio sólo altera el borrado de una
investigación suelta, camino que hoy ningún código ejecuta. Si el objetivo
fuera preservar esta evidencia ante el borrado de un proyecto, habría que
revisar ese segundo nivel de cascada — otra decisión de producto, no tomada.

**Corregido un test propio (P0.5-I-D).** `tests/db/fk-drift-guard.test.ts`
exigía que `0044` fuera la **última** entrada del journal; eso convertía en
fallo la llegada de cualquier migración posterior (y falló, en efecto, al crear
0045). Ahora compara su `when` contra las PREDECESORAS — la invariante real que
evita que `drizzle-kit migrate` la salte — y se añadieron 4 pruebas para 0045:
registro en el journal, coherencia schema↔migración, únicamente `SET NULL` en
las tres nullable y idempotencia `DROP`→`ADD`. Suite `tests/db` **23/23**.

---

## Orden de ejecución resumido

```
Fase 0:  Task 1 (auditor) ✅ → Task 2 (backup) ✅  [+ fix SSL: scripts/lib/db-connection.mjs]
Fase 1:  Task 3 (purga dry-run) ✅ limpio → Task 4 ✅ EJECUTADA (backup 8,45 MB → apply 4.515 filas → auditor 0/0)
Fase 2:  Task 5 (seed) → 6 (assert-env) → 7 (network) → 8 (osint) → 9 (ct) → 10 (advanced) → 11 (adversary) → 12 (graph)
Fase 3:  Task 13 (chat) → 14 (shell) → 15 (console) → 16 (monitoring) → 17 (panels)
Fase 4:  Task 18 (guard) → 19 (CI/pre-commit) → 20 (política) → 21 (verificación final)
```
