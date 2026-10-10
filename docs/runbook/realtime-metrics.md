# Runbook — Métrica de Realtime: caída de polling de `/api/intelligence/live`

**Cambio:** ADR-004-AMEND (Supabase Realtime en `LiveMetricsBar` y `OverviewTab`).
**Métrica:** peticiones/minuto al endpoint de respaldo `GET /api/intelligence/live`.
**Criterio de aceptación (ADR §15/§16):**

> Con Realtime conectado, la tasa de polling debe caer a **< 1 req/min por
> usuario activo**. En el caso ideal — canal suscrito y sin degradar — es **0**.

Este runbook existe para que esa afirmación se pueda **medir**, no suponer. El
riesgo que cierra (§15 del ADR) es que "el fallback se vuelva principal en
silencio": la UI se ve igual de bien con polling que con Realtime, así que el
único indicador de que Realtime está haciendo su trabajo es que el endpoint deje
de recibir tráfico.

---

## 0. Qué NO sirve para medir esto

- **`app_logs` (ADR-007)** sólo registra **errores** (`console.error` +
  `onRequestError`). Un request 200 a `/api/intelligence/live` no deja fila:
  no se puede contar polling desde ahí. No inventar una query que lo haga.
- **`vercel logs` desde CLI** devuelve una ventana de minutos e **ignora
  `--since`** (ADR-007 §2). Sirve para inspección en vivo, no como evidencia
  recuperable de tasa.

Las fuentes válidas son las tres de abajo.

---

## 1. Medición determinista (recomendada) — E2E con conteo de red

Es la única que aísla la variable y da un número reproducible. El spec
[`e2e/realtime-overview.spec.ts`](../../e2e/realtime-overview.spec.ts) ya la
implementa: cuenta las peticiones al endpoint en el navegador y exige:

- **0 peticiones** en una ventana de `FALLBACK_MS + 1 s` (16 s) con el canal
  suscrito → equivale a **0 req/min**;
- **≥ 1 petición** inmediatamente después de insertar una fila en
  `intelligence_run_events`, probando que el canal (no el sondeo) disparó el
  refresco.

Ejecución (opt-in, nunca en CI):

```bash
RUN_REALTIME_E2E=1 \
PLAYWRIGHT_TEST_BASE_URL=https://<staging> \
NEXT_PUBLIC_FEATURE_REALTIME_LIVE=1 \
NEXT_PUBLIC_SUPABASE_URL=... \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
REALTIME_E2E_INVESTIGATION_ID=<uuid de una investigación del usuario de prueba> \
TEST_AUTH_EMAIL=... TEST_AUTH_PASSWORD=... \
npx playwright test --grep @realtime
```

Si el flag está apagado o el canal no confirma, el test se **omite** (no falla):
un entorno mal configurado no es un defecto de producto.

---

## 2. Medición agregada en producción — Vercel Observability

Para la tasa real por usuario, sobre tráfico de producción:

1. Vercel → proyecto `strategicaudit-pro` → **Observability → Logs**.
2. Filtra por la ruta del endpoint: campo **Path** = `/api/intelligence/live`
   (en los registros de request el campo es `requestPath`).
3. Ventana de **5 minutos** con el flag `NEXT_PUBLIC_FEATURE_REALTIME_LIVE`
   activo en el usuario canary.
4. Cuenta las filas y divide entre 5 → **req/min**.

Fórmula:

```
req/min = (peticiones a /api/intelligence/live en N min) / N
```

Contrasta el mismo cálculo con el flag **apagado** (o contra una fecha previa al
despliegue de la Fase 2): con polling puro el suelo teórico es

```
1 usuario activo  ->  60 s / 15 s = 4 req/min
```

por cada usuario con el dashboard abierto. Cualquier valor por debajo de esa
línea base es la señal buscada.

> Para una tasa **durable** (no dependiente de la ventana de la UI) haría falta
> un Log Drain. Está anotado como mejora futura en ADR-007 §6 (Axiom vía Vercel
> Marketplace); no es un requisito de esta métrica.

---

## 3. Verificar que Realtime está realmente conectado — Supabase

Un número bajo de peticiones sólo es bueno si el canal está **vivo**. Antes de
dar la métrica por buena, confirma el lado de Realtime:

1. Supabase Dashboard → **Realtime → Inspector** (o la vista de clientes
   conectados del proyecto): debe haber un cliente por usuario activo mientras
   el dashboard está abierto.
2. Con la pestaña del dashboard abierta, el badge del hero (OverviewTab) y la
   barra de métricas muestran la etiqueta **"Realtime"**. Si muestran
   **"Sondeo 15s"**, el canal degradó y las peticiones del §2 serán altas — eso
   es el fallback funcionando, no una regresión del flag.

---

## 4. Interpretación

| Observación | Lectura |
|-------------|---------|
| 0 req/min con Realtime conectado | ✅ Ruta feliz (REQ-1). El sondeo no corre. |
| < 1 req/min por usuario activo | ✅ Criterio cumplido. |
| ~4 req/min por usuario activo | ⚠️ El fallback es el mecanismo real: revisar flag, RLS o el handshake WSS. |
| Pico periódico cada 15 s | ❌ Polling activo: `degrade()` se disparó. Ver logs de `CHANNEL_ERROR`/`TIMED_OUT`. |

---

## 5. Rollback

Degradar es inmediato y sin desplegar (REQ-6): poner
`NEXT_PUBLIC_FEATURE_REALTIME_LIVE=0` revierte al sondeo de 15 s. Tras el
cambio, el §2 debe volver a ~4 req/min por usuario activo — y esa subida es la
**confirmación de que el rollback funcionó**, no una alerta.

---

## Referencias

- ADR: `docs/architecture/ADR/ADR-004-AMEND-supabase-realtime.md` (§9 testing, §15 riesgos, §16 criterios, §18.3 pendientes).
- E2E: `e2e/realtime-overview.spec.ts` (`@realtime`).
- Flag: `src/shared/lib/flags.ts` · `NEXT_PUBLIC_FEATURE_REALTIME_LIVE`.
- Endpoint de respaldo: `src/app/api/intelligence/live/route.ts`.
- Sink de errores (por qué no sirve para contar requests): ADR-007.
