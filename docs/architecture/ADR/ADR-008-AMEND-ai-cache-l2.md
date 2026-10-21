---
layout: default
title: ADR-008 AMEND — Caché IA L2 en distributed_cache
nav_order: 3.4.8
permalink: /docs/architecture/adr/008-amend-ai-cache-l2
version: 0.2
fecha: 2026-10-20
autor: Owner (veredicto condicional) + Engineering
estado: Aprobado (condicional C1–C6, evidencia en tests)
---

# ADR-008 AMEND — Caché IA L2 (topología, TTL, scoping, confidencialidad)

## 1. Topología
- **L1**: memoria por instancia (`ai-cache.ts`, preexistente, P1-3). Primer lookup, latencia 0.
- **L2**: tabla `postgres` existente `distributed_cache` vía `distributed-cache.ts` (ADR-008 C2).
- **NO Redis**: el proyecto eliminó Upstash/Redis (ADR-002 enmiendas 14-15) y NO se re-introduce: el L2 es Postgres con el mismo `DATABASE_URL` (REQ-4 del ADR-008) — sin procesador externo, sin credenciales nuevas.

## 2. Scoping y confidencialidad
- Clave: `ai:<taskType>:<scope>:<hash-sha256(messages)>`. El **scope incluye el tenant** (contratado: `seo-report:{projectId}:{yyyy-mm-dd}`, `exec-brief:{projectId}`), y el hash nunca incluye el contenido del prompt crudo (C3).
- Acceso: la tabla conserva RLS habilitada sin policies (patrón `rate_limit_windows`): solo backend `directDb` lee/escribe; `anon`/`authenticated` no pueden tocarlo. No hay leak cross-tenant por SQL, y las claves por tenant garantizan aislamiento lógico (test C1).
- Values: `{ content, modelId, expiresAt }` de respuesta IA. Sin secretos ni tokens (C3).

## 3. TTL y invalidación
- L2: cap duro de **1 h** (L2_MAX_TTL_MS) sobre el TTL de taskType — ningún L2 sirve respuestas de más de 1 h (C2).
- L1: TTLs por taskType actuales sin cambio (deliberados: seo-report/exec-brief 24h porque su scope ya incluye fecha; el L1 gana siempre al L2).
- Invalidación on-write: `invalidateCacheScope(taskType, scope)` borra L1 **y ahora también** L2 (`cacheDeleteByPrefix`); `audit.trigger.ts` ya la dispara en cada scan nuevo (C2).

## 4. Semántica y contabilidad
- Hit → `modelUsed` de caché; el accounting existente de `ai_usage.fromCache` NO se toca (C4): tokens/costes siguen fiel-factorizados.
- Miss → path único `callAIWithFallback` intacto; la caché ni envuelve errores de proveedor ni toca circuit breakers (C5).

## 5. Interfaz añadida al ADR-008

> **Actualización 2026-10-21 (follow-ups cerrados)**: (1) los 4 call-sites que caían en `global` (general-chat, incident-brief, copilot-remediation, anomaly-narrative) pasan ahora `cacheScope` por tenant (`user:`/`project:`, F-SCOPE) — toda la caché IA es tenant-scoped; (2) `deleteByPrefix` escapa los metacaracteres LIKE (`%`, `_`, `\`) como literales — la invalidación por prefijo no borra de más.
- `CacheStore.deleteByPrefix?(prefix): Promise<number>` + wrapper `cacheDeleteByPrefix` fail-open (postgresql: DELETE key LIKE; memoria: ops Map). Opcional para backwards-compat.

## Consecuencia para §7 del ADR original
El requisito §7 ("comparte por tool+target público, nunca por dato de tenant") queda escindido: keys públicas para tools OSINT; keys por-tenant para la caché IA, protegidas por backend-only + scope. Ambos mecanismos permanecen en el ADR-008.
