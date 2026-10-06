# SCAUDIT SDK (TypeScript)

Cliente tipado de la **API pública v1** de StrategicAudit Pro. Cero dependencias:
solo `fetch`, disponible en Node 18+, Bun, Deno y navegador.

## Instalación

El SDK vive en el repositorio, en [`sdk/`](./index.ts). Impórtalo directamente
(o cópialo a tu proyecto) hasta que se publique como paquete:

```ts
import { ScAuditClient } from "./sdk";
```

Consigue tu API key en el panel: **Settings → API keys**. El scope de la key
determina a qué endpoints puede llamar:

| Scope | Endpoints |
|-------|-----------|
| `intelligence:read` | `/v1/intelligence`, `/v1/uptime` |
| `reports:read` | `/v1/reports` |
| `findings:read` | `/v1/findings` |
| `adversary:read` | `/v1/adversary` |
| (sin scopes) | compatibilidad: acceso completo |

Auditar (`/v1/audits`) usa `intelligence:read`.

## Uso

```ts
import { ScAuditClient, ScAuditApiError, detectionRate } from "./sdk";

const client = new ScAuditClient({ apiKey: process.env.SCAUDIT_API_KEY! });

// Estado de la plataforma (no requiere key; un 503 no lanza)
const health = await client.getHealth();
console.log(health.status, health.services.rateLimitStore);

// Hallazgos críticos
const { findings } = await client.listFindings("<projectId>", {
  severity: "critical",
  limit: 50,
});

// Uptime de los últimos 30 días
const uptime = await client.getUptime("<projectId>", { days: 30 });
console.log(uptime.uptimePct); // null si no hay chequeos, nunca 0%

// Purple team: cuánto de lo ejecutado se detectó
const { runs, assessments } = await client.listAdversary("<projectId>");
console.log(detectionRate(runs)); // null si nada tiene veredicto
```

### Manejo de errores

```ts
try {
  await client.listFindings("<projectId>");
} catch (error) {
  if (error instanceof ScAuditApiError) {
    // 401 key inválida/expirada · 403 falta scope · 404 sin acceso al proyecto · 429 rate limit
    console.error(error.status, error.message, error.body);
  }
}
```

## Honestidad de datos

El SDK no "arregla" los datos al vuelo: los tipos reflejan lo que la API
devuelve.

- `uptimePct: null` significa **sin chequeos**, no 0 % de disponibilidad.
- `finding.cvssScore` / `finding.mitreId` son `null` mientras el triage IA no
  ha clasificado el hallazgo.
- `adversaryRun.result: null` significa **sin veredicto** (pendiente o en
  curso). Usa `detectionRate()`, que excluye del denominador los runs sin
  veredicto y los que fallaron con error — un run no evaluado no es un fallo.

## Cobertura

Cubiertos (lectura, contrato estable): `getHealth`, `listIntelligence`,
`listAudits`, `listFindings`, `getUptime`, `listReports`, `listAdversary`.

**Hueco conocido:** `POST /api/public/v1/intelligence` (lanzar un escaneo) no
está en el SDK. Su respuesta incluye el detalle interno del planificador, que
todavía no es un contrato estable; mientras tanto puede llamarse por REST.

## Desarrollo

```bash
npx vitest run sdk            # tests del cliente
npx tsc --noEmit              # el SDK se type-checkea con el repo
```
