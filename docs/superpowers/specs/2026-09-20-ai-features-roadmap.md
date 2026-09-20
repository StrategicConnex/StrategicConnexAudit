# Roadmap IA — 3 meses (priorización de las 18 ideas)

**Fecha**: 2026-09-20 · **Estado**: propuesta · **Origen**: tormenta de ideas sobre el motor IA existente

## Supuestos del proyecto (verificados en código)

- Pool de modelos: `TASK_ROUTING` en `src/server/ai/ai-router.ts` con 6 task types, cadenas
  JSON-críticas separadas de chat, `MODEL_CAPABILITIES` verificado en vivo.
- Observabilidad: tabla `ai_health_logs` + dashboard `/ai/health` (latencia por modelo, fallos).
- Cache semántico `ai-cache.ts` por TTL; cuotas diarias `ai-usage.ts`.
- Eval inicial: `src/server/ai/eval/triage-scorer.ts` + `adversary-golden.json`.
- Trigger.dev disponible para batch/background; web-push y PDF ya en el stack.

## Matriz de priorización

Escala de esfuerzo: **S** < 2 días · **M** 2–5 días · **L** 1–2 semanas · **XL** > 2 semanas.
Impacto = valor para el usuario final + fiabilidad transversal + diferenciación de producto.

| # | Idea | Impacto | Esfuerzo | Cuadrante | Dependencias |
|---|------|---------|----------|-----------|--------------|
| 15 | Self-healing JSON | 8 | S | ⚡ Quick win | — |
| 1 | Triage automático de findings | 9 | M | ⚡ Quick win | eval/triage-scorer (existe) |
| 18 | Prompt versioning (hash por llamada) | 5 | S | ⚡ Quick win (habilitador) | — |
| 17 | Coste/tokens por feature | 6 | S–M | ⚡ Quick win (habilitador) | — |
| 16 | Invalidación de cache por evento + hit-rate | 7 | S–M | ⚡ Quick win | — |
| 5 | Alertas narradas (web-push) | 6 | S–M | ⚡ Quick win | `anomaly-narrative` (existe) |
| 2 | Resumen ejecutivo por proyecto | 8 | M | 🎯 Core | 16 (cache fresco) |
| 7 | Routing auto-curado por salud | 8 | M | 🎯 Core | 17, 18 (datos para decidir) |
| 8 | Eval continuo del pool | 8 | M | 🎯 Core | 18 (reproducibilidad) |
| 3 | Planes de remediación batch | 7 | M | 🎯 Core | 15 (JSON fiable) |
| 9 | Routing por latencia P95 | 5 | S | 🔄 Se cuela | 17 |
| 10 | Compliance copilot ENS/NIS2 | 9 | L | 🚀 Apuesta | 1 (triage como entrada) |
| 11 | Copilot proactivo post-scan | 9 | XL | 🚀 Apuesta | 15, 1, tool-registry (existe) |
| 12 | PDF conversacional (FAQ IA) | 5 | M | 📋 Backlog v2 | 2 |
| 13 | Multi-idioma de reportes | 5 | S–M | 📋 Backlog v2 | 2 |
| 14 | SOC ligero (timeline narrada) | 8 | XL | 📋 Backlog v2 | 2, 11 |
| 4 | Ticket sync (GitHub/Jira/Linear) | 6 | L | 📋 Backlog v2 | 1, 3 |
| 6 | Consenso multi-modelo | 5 | M | 📋 Backlog v2 | — (latencia ×2–3) |

**Lectura del cuadrante**: 6 quick wins financian la confianza; 4 ideas core convierten el pool en
autónomo y el portal en valioso; 2 apuestas diferencian el producto. Todo lo demás espera.

## Roadmap por sprint (2 semanas)

### Mes 1 — Fiabilidad y fundación

**Sprint 1: endurecimiento transversal**
- **15 · Self-healing JSON**: cuando la salida JSON sea inválida, reintentar (máx. 1) inyectando el
  error de parseo en el prompt antes de saltar de modelo. DoD: tasa de fallback por JSON roto ↓ medible.
- **18 · Prompt versioning**: hash del prompt (system+user) registrado en cada fila de
  `ai_health_logs`. DoD: cualquier eval es reproducible por versión de prompt.
- **17 · Coste/tokens por feature**: enriquecer `ai_health_logs` con tokens in/out, coste estimado
  y flag de cache-hit; desglose por task type en `/ai/health`. DoD: ver qué feature consume qué.

**Sprint 2: triage + cache inteligente**
- **1 · Triage automático**: nuevo task type JSON-crítico `finding-triage` (severidad sugerida,
  impacto, esfuerzo, MITRE). Job Trigger.dev post-scan + columna/tabla de resultado + UI badge en
  findings. Reutiliza `triage-scorer` + golden dataset como barrera de calidad.
- **16 · Cache por evento**: invalidación de claves por proyecto al entrar un scan nuevo; métrica
  de hit-rate visible. DoD: resúmenes nunca stale.
- *(Stretch)* **9 · Routing P95** ahora que 17 da los datos.

### Mes 2 — Producto visible + pool autónomo

**Sprint 3: valor en el portal**
- **2 · Resumen ejecutivo**: task type `exec-brief` (cache 24h + invalidación de 16), genera
  briefing no técnico tras cada auditoría; se muestra en portal cliente.
- **5 · Alertas narradas**: las notificaciones push de uptime/anomalías incluyen explicación IA y
  acción recomendada (extiende `anomaly-narrative`).

**Sprint 4: el pool se mantiene solo**
- **7 · Routing auto-curado**: job Trigger.dev diario que lee `ai_health_logs`, aplica histéresis
  (la regla ya escrita en `ai-router.ts`: "healthy 2 días seguidos → re-entra"; "2 fallos → fuera")
  y actualiza `TASK_ROUTING` (tabla en BD o config persistida). Guardrail: nunca dejar una cadena
  JSON-crítica con < 2 modelos verificados.
- **8 · Eval continuo**: job semanal que corre el golden dataset contra todos los modelos del pool
  y actualiza `MODEL_CAPABILITIES` + propone cambios de cadena (PR o log para revisión).
- *(Stretch)* **3 · Planes de remediación batch** post-scan vía Trigger.dev.

### Mes 3 — Apuestas estratégicas

**Sprint 5: Compliance copilot (MVP ENS)**
- **10 · Compliance copilot ENS**: mapear findings → controles ENS (medidas op.exp./op.fac),
  checklist de brechas por proyecto. Fuentes: catálogo ENS oficial curado en tabla
  `compliance_controls`; el triage (1) alimenta el mapeo. DoD: informe de cumplimiento exportable
  por proyecto. NIS2/ISO 27001 quedan como extensiones del mismo modelo de datos.

**Sprint 6: Copilot proactivo (MVP) + cierre**
- **11 · Copilot proactivo**: al finalizar una auditoría, el copilot inicia la conversación con
  contexto real ("3 críticos nuevos…") usando tool-calling sobre `tools/registry.ts` (findings,
  uptime, audits). DoD: primer mensaje accionable sin que el usuario pregunte.
- Cierre: retro del trimestre con métricas (abajo), decisión sobre Backlog v2.

## KPIs por mes

| Mes | KPI | Línea base | Objetivo |
|-----|-----|-----------|----------|
| 1 | Fallbacks por JSON roto (15) | medir | −50% |
| 1 | Coste/token visible por feature (17) | 0 | 100% task types |
| 2 | Findings con triage IA (1) | 0% | ≥90% de findings nuevos |
| 2 | Cache hit-rate (16) | medir | ≥40% en task types cacheables |
| 3 | Portal con exec-brief (2) | 0% | 100% de proyectos auditados |
| 3 | Uptime del pool sin intervención manual (7/8) | manual | 0 interventions/semana |
| 3 | Proyectos con informe ENS (10) | 0 | piloto con ≥1 proyecto real |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Rate limits / inestabilidad de modelos `:free` | Sprints 1 y 4 (self-healing, auto-curation, eval continuo) reducen el blast radius; Anthropic directo como último recurso ya existe |
| Contenido ENS incorrecto (riesgo legal/reputacional) | Catálogo curado a mano desde fuente oficial + revisión humana del output; MVP marcado como "borrador, no asesoría legal" |
| Latencia de jobs batch en horas punta | Trigger.dev + cache semántico + cuotas por usuario (ya implementadas) |
| Copilot proactivo invasivo | MVP: solo tras completar auditoría, opt-out en ajustes del proyecto |

## Fuera de alcance este trimestre

4 (ticket sync), 6 (consenso), 12 (PDF conversacional), 13 (multi-idioma), 14 (SOC ligero) —
re-evaluar en la retro del mes 3; 13 probablemente sea el primer rescate (esfuerzo bajo una vez
existe 2).
