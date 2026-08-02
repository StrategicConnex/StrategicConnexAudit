# MASTER INDEX — SCAUDIT Pro

> **Propósito:** índice maestro del [Engineering Master Plan](plans/2026-08-01-engineering-master-plan.md). Garantiza continuidad entre batches, evita contradicciones y registra el estado de cada artefacto documental.
>
> **Regla de gobierno:** actualizar este índice al cerrar cada batch y tras cualquier cambio de estado de un artefacto (§53 del master prompt).

**Plan fuente:** `docs/superpowers/plans/2026-08-01-engineering-master-plan.md` [VERIFIED]
**Última actualización:** 2026-08-02 (BATCH 01 — B01 completado)

---

## Tabla de batches

| Batch | Nombre | Estado | Artefacto principal | Ruta |
|-------|--------|--------|---------------------|------|
| B00 | Gobierno y Baseline | **en curso** (checkpoint pendiente) | Estado git estable, MASTER INDEX, esqueleto `docs/` target | este archivo |
| B01 | Arquitectura y Proyecto | **completado** (2026-08-02) | PROJECT-INVENTORY, SYSTEM-MAP, DEPENDENCY-GRAPH, ADR-000..006 | `docs/architecture/` |
| B02 | Seguridad y Auth | pendiente | SECURITY-AUDIT-REPORT, THREAT-REGISTER, validación RLS, secretos | `docs/security/` |
| B03 | Base de Datos y Datos | pendiente | DATA-DICTIONARY, ERD, INDEX-STRATEGY, Data Lineage | `docs/database/` |
| B04 | Módulos y Contratos | pendiente | Module Contract ×9 módulos | `docs/modules/` |
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
| DATA-DICTIONARY / ERD / INDEX-STRATEGY | por crear | `docs/database/` | B03 |
| SECURITY-AUDIT-REPORT | existe — actualizar | `docs/security/SECURITY-AUDIT-REPORT.md` | B02 |
| THREAT-REGISTER | por crear | `docs/security/THREAT-REGISTER.md` | B02 |
| Module Contracts (9) | por crear | `docs/modules/` | B04 |
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
- [ ] **B02 — Seguridad y Auth** (SECURITY-AUDIT refresh, THREAT-REGISTER, validación RLS, secret scanning)
- [ ] **B03 — Base de Datos y Datos** (DATA-DICTIONARY, ERD, INDEX-STRATEGY, migraciones)
- [ ] **B04 — Módulos y Contratos** (Module Contract template + 9 módulos)
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
