# Ejecutivo — Verificación de Tasks Trigger.dev + AI real + Auth · 2026-10-18

Credencial de producción (`TRIGGER_STATUS_SECRET_KEY`), datos reales de la API
y de la BD. Sin ningún dato estimado.

---

## 1. Inventario de tasks declaradas

**27 archivos `.trigger.ts` / 34 task IDs declarados** (no 13: hay archivos que
declaran varias tasks — `cron-dispatchers` 4, `scan-queue` 4, `eval-weekly` 2,
`finding-triage` 2). El draft "esperado: 13" quedó corto respecto al repo.

## 2. Schedules activos (9 — todos del patrón consolidado)

| Schedule | Cron | Próxima |
|---|---|---|
| `siem-exporter` | `*/5 * * * *` | cada 5 min |
| `periodic-anomaly-detection` / `uptime-monitor` | `*/15 * * * *` | cada 15 min |
| `scheduled-scan-runner` | `0 * * * *` | cada hora |
| `six-hourly-dispatcher` | `0 */6 * * *` | cada 6 h |
| `daily-operations-dispatcher` | `0 3 * * *` | 03:00 UTC |
| `daily-governance-dispatcher` | `0 5 * * *` | 05:00 UTC |
| `weekly-monday-dispatcher` | `0 3 * * 1` | lunes 03:00 |
| `eval-pool-weekly` | `0 6 * * 0` | domingo 06:00 |

`cleanup-old-logs` **no tiene schedule propio**: lo ejecuta el dispatcher
consolidado (ruta fría) — diseñado así en P2-14.

## 3. Última ejecución por task (21 con runs · 13 sin runs)

**Sin runs (13)** — TS mayormente on-demand/event-triggered (normal):
`run-project-audit`, `triage-after-audit`, `exec-brief-after-audit`,
`drain-outbox-task`, `drain-scan-queue(-task)`, `purge-scan-queue-task`,
`dispatch-webhook-task`, `adversary-real-assessment`, `ai-seo-report-generation`,
`eval-pool`, `mitre-real-evaluation`, `hello-world` (template).

### 🔴 HALLAZGO CRÍTICO: 15 tasks FAILED de forma sostenida

El verificador oficial (`dispatcher-status`) reporta "cron sano" porque sólo mira
el status del dispatcher (que COMPLETA el fan-out sin esperar a los hijos).
Las tasks hijas llevan **al menos 6 días fallando** (12-oct → hoy, 15:45 UTC):

```
cleanup-old-logs          7/7 FAILED (retención P2-14 NO corre)
finding-triage-sweep      7/7 FAILED
finding-sla-sweep         7/7 FAILED
integration-sync-sweep    7/7 FAILED
evaluate-monitors-task    7/7 FAILED
notifications-maintenance 7/7 FAILED
periodic-anomaly-detection 10/10 FAILED
continuous-discovery      10/10 FAILED
scheduled-scan-runner     10/10 FAILED
uptime-monitor            10/10 FAILED
periodic-adversary-simulation FAILED
eval-pool-weekly FAILED · weekly-forecast FAILED (12-oct)
weekly-digest FAILED · weekly-full-pentest FAILED (12-oct)
```

Completan sin tocar la BD del path directo: dispatchers, `siem-exporter`,
`api-key-expiry-alert`.

### Causa raíz (cadena completa, trazada)

1. Toda task que toca la BD: `Failed query` → causa embebida:
   **`self-signed certificate in certificate chain`** (pg-pool → TLS handshake).
2. `getSupabaseCa()` (`src/shared/db/index.ts:18`) lee el CA de **`process.cwd()`**
   → `src/shared/db/supabase-ca.crt`. En el runtime de Trigger.dev ese path no
   existe → `ca: undefined` + `rejectUnauthorized: true`.
3. El pooler de Supabase (`aws-1-sa-east-1.pooler.supabase.com`) presenta
   cadena firmada por la CA de Supabase (no en los roots de Node) → handshake rechazado.
4. La app web (Vercel) no depende de ese cwd → sus escrituras sí funcionan.
   El fallo es **exclusivo del runtime de workers** (cwd distinto, archivos no
   empaquetados igual).
5. pg `8.20.0` (`52f23d1`) endureció `sslmode` (`require`≡`verify-full`), pero el
   código ya elimina `sslmode` de la URL y provee el CA — el fallo es el **path del CA en workers**, no la política.

## 4. AI real (`AI_REAL_TESTS=1`)

- **5 passed / 2 failed** — mismos fallos transitorios del tier `:free`
  (respuesta vacía de `nvidia/…` y JSON truncado de un modelo de cadena), patrón
 idéntico al de 17-oct. DNS correcto (104.18.3.115).
- `ai_usage` (BD real, 25 registros históricos): 4 cadenas exitosas en 24h
  (`openrouter/free` 1, `nemotron-3-nano-omni` 6, cohere 12, nemotron-ultra 4
  con 912/880 tokens reales a las 09:50).

## 5. Auth / Resend / allowlist / rate limit

| Check | Estado |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` | ✅ presente |
| `RESEND_API_KEY` en `.env.local` | ❌ **AUSENTE** (emails caen al fallback manual — diseñado así «honesto, no fake») |
| Allowlist owner `palacios_juan@hotmail.com` | ✅ en `src/shared/lib/ratelimit.ts:10` (bypass confirmado por tests) |
| Rate limit `validate-email` | ✅ 40/60s sliding window por IP, bypass para allowlist, headers estándar |

## 6. Reparación EJECUTADA (2026-10-18 · aprobada por el owner)

| Paso | Evidencia |
|---|---|
| 1. CA embebido: `src/shared/db/supabase-ca.ts` (auto-generado del `.crt`) + `getSupabaseCa()` con override `SUPABASE_CA_CRT` (PEM o base64) y sin dependencia del filesystem | commit `e5ea185` · typecheck 0 · build 0 |
| 2. Credenciales de workers: el entorno del proyecto Trigger.dev tenía `DATABASE_URL`/`DIRECT_URL` desfasadas (por eso `password authentication failed`). Sincronizadas vía API (`PUT/POST /api/v1/projects/<ref>/envvars/prod` → 3× HTTP 200: DATABASE_URL, DIRECT_URL, OPENROUTER_API_KEY) | env vars sync verificada en vivo |
| 3. Deploy de triggers en producción | **versión `20261018.1`** (`npx trigger.dev@4.7.2 deploy`, exit 0) |
| 4. Verificador endurecido: `evaluateDispatcher` marca problem si la última run de la retención FAILED aunque el dispatcher COMPLETE (el gap que la suite enshrineaba). El test anterior «prefiere las ejecuciones del dispatcher» ahora espera problem. 3 casos nuevos · 19 tests | commit `35d3141` · suite del reporte 19/19 |

### Verificación con runs reales (post-fix)

| Task | Resultado |
|---|---|
| `notifications-maintenance` (trigger manual) | ✅ **COMPLETED** (`run_06gkt2iroifmsn6piuj2tvhb01`) |
| `cleanup-old-logs` (trigger manual) | ✅ **COMPLETED** (`run_06gkt2ogr31oj0ngl52ng0rv01`) — **la retención P2-14 vuelve a correr** |
| `scheduled-scan-runner` (trigger manual) | ✅ **COMPLETED** (`run_06gkt4d93immlt2d3av5nrp501`) |
| `uptime-monitor` (ciclo natural 10:30) | ✅ COMPLETED (era 10/10 FAILED) |
| `periodic-anomaly-detection` (ciclo natural 10:15) | ✅ COMPLETED (era 10/10 FAILED) |
| dispatcher-status endurecido | exit 0 · «última ejecución de cleanup-old-logs: COMPLETED (0.0 h)» |
| Bonus del deploy | el schedule de `drain-scan-queue` se registró (10 schedules; la task estaba silenciosa) |

**Nota sobre las credenciales del worker**: sus env vars viven en el proyecto
Trigger.dev y NO derivan de `.env.local`. Si Supabase rota la contraseña, hay
que re-sincronizarlas (dashboard → Settings → Environment Variables, o la misma
fila de `envvars`) — añadir este punto al manual de rotación de secretos.

---

## 7. Estado final de la intervención

- **15 tasks desbloqueadas** (TLS + credenciales) — los schedules harán el resto
  de la fecha de confirmación de forma natural (`six-hourly` 12:00,
  `daily-*` 03:00/05:00, `weekly-*` lunes/domingo).
- El gap que ninguna suite veía queda blindado en dos capas: el CA viaja en el
  bundle y el verificador exige que el hijo de retención reporte éxito real.

---

*Reporte generado con credencial de producción. Hecho más serio con evidencia:
`cleanup-old-logs` 7/7 FAILED — desde hace ≥6 días el DELETE de retención de
P2-14 no se aplica en producción, y el verificador actual no mira los hijos del
dispatcher, por lo que este gap quedó invisible pese a que la suite veía green.*
