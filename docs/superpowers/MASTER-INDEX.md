# MASTER INDEX — SCAUDIT Pro

> **Propósito:** índice maestro del [Engineering Master Plan](plans/2026-08-01-engineering-master-plan.md). Garantiza continuidad entre batches, evita contradicciones y registra el estado de cada artefacto documental.
>
> **Regla de gobierno:** actualizar este índice al cerrar cada batch y tras cualquier cambio de estado de un artefacto (§53 del master prompt).

**Plan fuente:** `docs/superpowers/plans/2026-08-01-engineering-master-plan.md` [VERIFIED]
**Última actualización:** 2026-08-02 (BATCH 04 — B04 completado)

---

## Tabla de batches

| Batch | Nombre | Estado | Artefacto principal | Ruta |
|-------|--------|--------|---------------------|------|
| B00 | Gobierno y Baseline | **en curso** (checkpoint pendiente) | Estado git estable, MASTER INDEX, esqueleto `docs/` target | este archivo |
| B01 | Arquitectura y Proyecto | **completado** (2026-08-02) | PROJECT-INVENTORY, SYSTEM-MAP, DEPENDENCY-GRAPH, ADR-000..006 | `docs/architecture/` |
| B02 | Seguridad y Auth | **completado** (2026-08-02) | SECURITY-AUDIT-REPORT v2.0, THREAT-REGISTER, rls.test.ts, secret-scan, ENVIRONMENT-MATRIX | `docs/security/`, `docs/guides/`, `src/shared/db/` |
| B03 | Base de Datos y Datos | **completado** (2026-08-02) | DATA-DICTIONARY, ERD, INDEX-STRATEGY, Data Lineage, estado migraciones | `docs/database/` |
| B04 | Módulos y Contratos | **completado** (2026-08-02) | Module Contract template + ×9 módulos (gate 100/100 c/u) | `docs/modules/` |
| B05 | Jobs y Trigger.dev | pendiente | Job Contract ×12 triggers | `docs/jobs/` |
| B06 | Testing | pendiente | TEST-COVERAGE-MATRIX + tests nuevos | `docs/testing/` |
| B07 | Performance | pendiente | Refresh PERFORMANCE_REPORT + CWV + bundle | `docs/improvements/` |
| B08 | Observabilidad | pendiente | OBSERVABILITY-MATRIX + convención de IDs | `docs/observability/` |
| B09 | i18n | pendiente | I18N-AUDIT + script de paridad de keys | `docs/i18n/` |
| B10 | Final | pendiente | TRACEABILITY-MATRIX, RISK-REGISTER, TECH-DEBT-REGISTER, FINAL-REPORT, Quality Gate | `docs/{traceability,risk,technical-debt,improvements}/` |

## Estado de artefactos

| Artefacto | Estado | Ruta | Batch |
|-----------|--------|------|-------|
| MASTER-INDEX (este archivo) | creado | `docs/superpowers/MASTER-INDEX.md` | B00 |
| Esqueleto `docs/` target (10 dirs + `.gitkeep`) | creado | `docs/{adr,database,modules,jobs,testing,observability,i18n,risk,technical-debt,traceability}/` | B00 |
| Baseline de verificación (lint/build/test/coverage) | registrado | `docs/superpowers/MASTER-INDEX.md` §Baseline | B00 |
| ENTERPRISE-ARCHITECTURE.md | existe — actualizado (ADRs enlazados) | `docs/architecture/ENTERPRISE-ARCHITECTURE.md` | B01 |
| PROJECT-INVENTORY.md | creado | `docs/architecture/PROJECT-INVENTORY.md` | B01 |
| SYSTEM-MAP.md | creado | `docs/architecture/SYSTEM-MAP.md` | B01 |
| DEPENDENCY-GRAPH.md | creado | `docs/architecture/DEPENDENCY-GRAPH.md` | B01 |
| ADR-000..006 | creado | `docs/architecture/ADR/` | B01 |
| DATA-DICTIONARY.md | creado (58 tablas, 25 enums, 70 FKs, 71 índices) | `docs/database/DATA-DICTIONARY.md` | B03 |
| ERD.md | creado (6 mermaid erDiagram + FLOW-010..015) | `docs/database/ERD.md` | B03 |
| INDEX-STRATEGY.md | creado (MAT-021/022, 7 recomendaciones, 8 hallazgos) | `docs/database/INDEX-STRATEGY.md` | B03 |
| SECURITY-AUDIT-REPORT | existe — **actualizado v2.0** | `docs/security/SECURITY-AUDIT-REPORT.md` | B02 |
| THREAT-REGISTER | creado (15 amenazas STRIDE) | `docs/security/THREAT-REGISTER.md` | B02 |
| ENVIRONMENT-MATRIX | creado (37 vars por ambiente) | `docs/guides/ENVIRONMENT-MATRIX.md` | B02 |
| RLS contract test | creado (5 tests) | `src/shared/db/rls.test.ts` | B02 |
| CI secret-scan | añadido (gitleaks) | `.github/workflows/ci.yml` | B02 |
| Module Contracts (template + 9) | creados (gate 100/100 c/u) | `docs/modules/` | B04 |
| Job Contracts (12) | por crear | `docs/jobs/` | B05 |
| TEST-COVERAGE-MATRIX | por crear | `docs/testing/TEST-COVERAGE-MATRIX.md` | B06 |
| OBSERVABILITY-MATRIX | por crear | `docs/observability/OBSERVABILITY-MATRIX.md` | B08 |
| I18N-AUDIT | por crear | `docs/i18n/I18N-AUDIT.md` | B09 |
| TRACEABILITY-MATRIX | por crear | `docs/traceability/TRACEABILITY-MATRIX.md` | B10 |
| RISK-REGISTER | por crear | `docs/risk/RISK-REGISTER.md` | B10 |
| TECH-DEBT-REGISTER | por crear | `docs/technical-debt/TECH-DEBT-REGISTER.md` | B10 |
| FINAL-REPORT | por crear | `docs/improvements/FINAL-REPORT.md` | B10 |

## Checklist B00 → B10

- [x] **B00 — Gobierno y Baseline** (en curso: tareas T00-01..T00-03 ejecutadas, checkpoint pendiente)
  - [x] T00-01 Estabilizar working tree (2 commits: `45fc18a`, `8955304`)
  - [x] T00-02 MASTER-INDEX + esqueleto `docs/` target
  - [x] T00-03 Baseline de verificación (registrado en §Baseline)
- [x] **B01 — Arquitectura y Proyecto** (completado 2026-08-02; commits `82b09d3`, `cc87d41`, `b498a88`, `e595d28`, + enlace ADR/CI)
  - [x] T01-01 PROJECT-INVENTORY.md — 32 elementos, gate 95/100 (check ERD fuera de alcance, reportado)
  - [x] T01-02 SYSTEM-MAP.md — FLUJO A (request) + FLUJO B (Trigger.dev) + Module Map, gate 100/100
  - [x] T01-03 DEPENDENCY-GRAPH.md — madge 282 files, 9 ciclos types-only, fan-in/out, god modules, duplicación `AttackSurfaceGraph`, gate 100/100
  - [x] T01-04 ADR-000-template + ADR-001..006 — 7 archivos, 8 secciones + evidencia `[VERIFIED]`, gate 100/100 cada uno
- [x] **B02 — Seguridad y Auth** (completado 2026-08-02; commits `docs(b02)`, `test(b02)`, `ci(b02)`, `fix(b02)`)
  - [x] T02-01 SECURITY-AUDIT-REPORT.md refresh v2.1 — inventario 42 rutas, matriz OWASP, Service Role verificado; gate 100/100
  - [x] T02-02 THREAT-REGISTER.md — 15 amenazas STRIDE, 7 columnas, controles → archivos; gate 100/100
  - [x] T02-03 rls.test.ts — contract test SQL de withRLS (5 tests verdes); isolación por usuario verificada
  - [x] T02-04 secret-scan (gitleaks) en CI + ENVIRONMENT-MATRIX.md (37 vars, gate 100/100)
  - [x] **REMEDIACIÓN IDOR (MODE C, aprobado en CHECKPOINT):** VULN-004 `history` (auth `authenticate` + owner-check `withRLS` → 404) y VULN-005 `assets/graph` (auth + queries en `withRLS`). Verificado: tests 253/253, lint 0 errores, build PASS. SECURITY-AUDIT v2.1 + THREAT-REGISTER actualizados.
- [x] **B03 — Base de Datos y Datos** (completado 2026-08-02; commits `docs(b03)`, `fix(db)`)
  - [x] T03-01 DATA-DICTIONARY.md — 58 tablas (plan asumía 56) en 12 dominios; 25 pgEnums, 70 FKs, 71 índices; hallazgos INDEX-201/202
  - [x] T03-02 ERD.md — 6 diagramas mermaid por dominio + FLOW-010..015 (lineage con evidencia archivo:línea)
  - [x] T03-03 INDEX-STRATEGY.md — MAT-021/022; 7 índices [RECOMMENDED] con consultas reales; 8 hallazgos (MAT-201..208)
  - [x] Verificación migraciones: journal 20 (0000–0019) vs disco 21 → huérfano `0001_quota_enforcement.sql` confirmado (byte-idéntico a 0002); `0010_snapshot.json` malformed (2 tablas); faltan 12 snapshots
  - [x] **HIGIENE DE MIGRACIONES (MODE C, aprobado en CHECKPOINT, commit `2f977c3`):** eliminado `0001_quota_enforcement.sql` (duplicado de 0002) y `0010_snapshot.json` (malformed); regenerado `0019_snapshot.json` (58 tablas, 21 enums, prevId→0006). Verificado: `drizzle-kit check` → "Everything's fine", `drizzle-kit generate` → "No schema changes" (db:generate desbloqueado), `pnpm build` PASS. INDEX-STRATEGY actualizado.
- [x] **B04 — Módulos y Contratos** (completado 2026-08-02; commits `docs(b04)`)
  - [x] T04-01 MODULE-CONTRACT-template.md (13 secciones, §5 gobernanza, gate 100/100)
  - [x] 9 contratos de módulo (audit, backlinks, competitors, cro, integrations, keywords, performance, reporting, schema) — gate 100/100 cada uno, evidencia `[VERIFIED]` con rutas reales
  - [x] Hallazgos documentados: 9 módulos esqueleto vacíos (0 archivos), 4 dominios sin lógica, fugas de infraestructura (sin escritor/consumidor), PerformanceTab estático
  - [x] Verificación: quality gate 100/100 ×10 docs, `pnpm build` PASS
- [ ] **B05 — Jobs y Trigger.dev** (Job Contract ×12 + análisis idempotencia)
- [ ] **B06 — Testing** (TEST-COVERAGE-MATRIX + unit tests `src/modules` + route tests)
- [ ] **B07 — Performance** (refresh PERFORMANCE_REPORT + CWV + bundle)
- [ ] **B08 — Observabilidad** (OBSERVABILITY-MATRIX + convención correlation IDs)
- [ ] **B09 — i18n** (I18N-AUDIT + script paridad keys)
- [ ] **B10 — Final** (TRACEABILITY-MATRIX, RISK-REGISTER, TECH-DEBT-REGISTER, FINAL-REPORT, Quality Gate)

## Baseline de verificación

> Registrado por T00-03 el 2026-08-01. Comandos: `pnpm lint` · `pnpm build` · `pnpm test` · `pnpm test:coverage`. Fuente: salida real de los comandos [VERIFIED].

| Comando | Resultado | Detalle |
|---------|-----------|---------|
| `pnpm lint` | **PASS** — 0 errores, 69 warnings | warnings `no-unused-vars` / `react-hooks/exhaustive-deps` preexistentes, no bloqueantes |
| `pnpm build` | **PASS** — compilado OK (37.7s + TS 37.0s) | Next.js 16.2.4 Turbopack; 1 warning no bloqueante (NFT trace en `next.config.ts`) |
| `pnpm test` | **PASS** — 248 tests / 248 passed (19 files) | Vitest 4.1.5, duración 27.52s |
| `pnpm test:coverage` | **EJECUTADO — NO cumple umbrales globales (exit 1)** | Statements 12.51% (umbral 25%) · Branches 9.78% (umbral 20%) · Functions 8.8% (umbral 20%) · Lines 12.46% (umbral 25%) |

> **Nota coverage:** los tests pasan en verde; el fallo es solo de umbral de cobertura global (preexistente, no causado por B00). Registrado como baseline para verificar no-regresión. Ver `docs/testing/TEST-COVERAGE-MATRIX.md` (B06) y `src/trigger/*` al 0% como áreas críticas.
>
> **Nota quality gate:** `node scripts/quality-gate.mjs docs/superpowers/MASTER-INDEX.md --min 80` → **10/100 FAIL** porque el validador usa el template de 20 secciones de documentación técnica (scope/arquitectura/flujos/API…). MASTER-INDEX.md es un artefacto de gobernanza, no un doc técnico; el plan remite el ajuste del validador a B10. No bloqueante para B00 [OBSERVED].

## Notas

- T00-01 respetó exactamente la división en 2 commits del plan. Archivos no relacionados con B00 (`.claude/`, `.idea/`, `.serena/`, `docs/scaudit-documentacion-unificada.html`, `docs/superpowers/plans/…`) quedaron **sin commitear** [OBSERVED].
- El archivo del plan (`docs/superpowers/plans/2026-08-01-engineering-master-plan.md`) se mantiene intacto y **sin commitear** (no estaba listado en los commits de T00-01) [OBSERVED].
- B01 (2026-08-02): 4 commits `docs(b01): ...` (T01-01..T01-04). Hallazgos transferibles a B02/B03: migración huérfana `0001_quota_enforcement.sql`; duplicación `AttackSurfaceGraph` (2 componentes, HIGH); 9 ciclos types-only en `schemas/index.ts`; `src/modules/` sin tests; cobertura Statements 12.51% preexistente. Check 04 del gate en PROJECT-INVENTORY (ERD/dictionary) quedó fuera de alcance del inventario y se reportó sin arreglar.
- B02 (2026-08-02): 3 commits (`docs(b02)`, `test(b02)`, `ci(b02)`) + 2 de remediación (`fix(b02)`). **Hallazgos HIGH remediados (MODE C, aprobado en CHECKPOINT):** VULN-004 IDOR cross-tenant en `/api/intelligence/history` (sin auth, directDb) → auth (`authenticate`) + owner-check `withRLS`; VULN-005 IDOR en `/api/intelligence/assets/graph` (sin auth, sin RLS) → auth + queries en `withRLS`. Verificado: tests 253/253, lint 0 errores, build PASS. **Pendientes (B03):** VULN-001 XSS IA AiCopilot (escapeHtml), VULN-002 secret token GET webhooks, VULN-003 `/intelligence` fuera de rutas del middleware, VULN-006 auth condicional looker-studio, VULN-007 SSE pdf/progress sin auth. Inconsistencia env: `NEXT_PUBLIC_SUPABASE_ANON_KEY` vs `PUBLISHABLE_KEY` en `useRealtimeMetrics.ts`. Gitleaks añadido con `continue-on-error` (barrera dura pendiente de validar en GitHub Actions). [OBSERVED]
- B03 (2026-08-02): 4 commits `docs(b03): ...` (T03-01..T03-03 + cierre) + 1 de higiene (`fix(db)`). 58 tablas documentadas (el plan asumía 56; la real es mayor — ver DATA-DICTIONARY §Anexo). **Higiene de migraciones ejecutada (MODE C, aprobado en CHECKPOINT, commit `2f977c3`):** eliminado huérfano `0001_quota_enforcement.sql` (byte-idéntico a `0002`, SHA-256 `DF676882…E266`); eliminado `0010_snapshot.json` malformed; regenerado `0019_snapshot.json` desde esquemas TS (58 tablas, 21 enums, prevId→0006). Verificado: `drizzle-kit check` "Everything's fine" ✅, `drizzle-kit generate` "No schema changes" ✅ (db:generate desbloqueado), `pnpm build` PASS ✅. **Drift restante (documentado, no bloqueante):** `idx_adversary_mitre_id` no-único (0012) ausente del esquema; triggers de cuota fuera de esquemas Drizzle; `push_subscriptions.active` es `text 'true'`; 12 snapshots intermedios faltantes (no regenerables sin BD de referencia). Pendiente B03→B04: validar CI gitleaks, 5 VULN del B02 (VULN-001 XSS IA, VULN-002, VULN-003, VULN-006, VULN-007), recomendar MAT-205 (dropear índice no-único) en siguiente MODE C. [OBSERVED]
- B04 (2026-08-02): 2 commits `docs(b04): ...` (`25d9ac0` + cierre). **Inventario real `src/modules/*`:** 9 directorios (audit, backlinks, competitors, cro, integrations, keywords, performance, reporting, schema) con estructura clean-architecture (`application/`, `domain/`, `infrastructure/`, `presentation/`) pero **0 archivos** — 153 subdirectorios vacíos, 0 rastreados por git. La funcionalidad real vive en capas legacy (`src/app/actions/*`, `src/app/api/**`, `src/trigger/*`). **Hallazgos transferibles a B05/B06/B10:** `integration_sync_logs`/`integration_data_bing`/`integrations` sin escritor; `performance_results` sin consumidor (`PerformanceTab.tsx` con datos estáticos hardcodeados L28-39); no existe `src/app/api/integrations/**` (fuga de infraestructura); `reports.report` sin escritor (comentario `-- Legacy: reports.report`); 4 dominios sin lógica de negocio (backlinks, competitors, cro, schema — tablas solo-seed). Contract tests de RLS cubren tabla `competitors` pero ningún test cubre los módulos. Verificado: quality gate 100/100 ×10 docs, `pnpm build` PASS. [OBSERVED]
