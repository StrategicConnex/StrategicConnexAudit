# 🎯 Plan de Acción Detallado — StrategicAudit Pro

**Fecha:** 30 de agosto de 2026  
**Basado en:** Informe Consolidado de Auditoría (72/100)  
**Objetivo:** Elevar la puntuación de 72 → 90+ en 4 semanas

---

## 📋 Resumen de Tareas

| Semana | Enfoque | Tareas | Esfuerzo |
|--------|---------|--------|----------|
| **1** | Seguridad Crítica | 6 tareas | ~16h |
| **2** | Calidad de Código | 5 tareas | ~20h |
| **3** | Rendimiento y BD | 5 tareas | ~14h |
| **4** | Pruebas y DX | 4 tareas | ~16h |

---

## SEMANA 1: Endurecimiento de Seguridad 🔒

### Tarea 1.1 — Actualizar Dependencias Vulnerables
**Prioridad:** 🔴 CRÍTICO | **Esfuerzo:** 2h | **Archivos:** `package.json`, `pnpm-lock.yaml`

**Problema:** 113 vulnerabilidades (45 high, 54 moderate, 14 low)

**Pasos:**
```bash
# 1. Actualizar paquetes @trigger.dev (arrastran systeminformation vulnerable)
cd strategicaudit-pro
pnpm update @trigger.dev/build @trigger.dev/sdk

# 2. Actualizar Next.js (vulnerabilidad DoS en Server Components)
pnpm update next

# 3. Anular systeminformation si la actualización no lo resuelve
# Agregar en package.json:
```

**Cambio en `package.json`:**
```json
{
  "pnpm": {
    "overrides": {
      "systeminformation": ">=5.30.8",
      "undici": ">=7.10.0"
    }
  }
}
```

**Verificación:**
```bash
pnpm audit 2>&1 | tail -5
# Objetivo: 0 vulnerabilidades high/critical
```

---

### Tarea 1.2 — Sanitizar Stack Traces en API
**Prioridad:** 🔴 CRÍTICO | **Esfuerzo:** 1h | **Archivo:** `src/app/api/intelligence/route.ts`

**Problema:** Línea 418 expone `error.stack` al cliente

**Cambio:**
```typescript
// ❌ Línea 418 — ANTES
payload: { error: error instanceof Error ? error.stack : error }

// ✅ DESPUÉS
payload: { error: "Error interno del servidor" }
```

**Búsqueda adicional — aplicar a todas las rutas API:**
```bash
grep -rn "error\.stack\|error\.message" src/app/api/ --include="*.ts"
```

**Archivos a revisar:**
- `src/app/api/intelligence/route.ts:418`
- `src/app/api/reports/pdf/progress/route.ts:70,100,111`

---

### Tarea 1.3 — Verificar Auth en Rutas Públicas
**Prioridad:** 🔴 CRÍTICO | **Esfuerzo:** 2h | **Archivos:** 4 rutas API

**Rutas sin auth detectadas:**
1. `src/app/api/public/v1/intelligence/route.ts`
2. `src/app/api/security/csp-report/route.ts`
3. `src/app/api/telemetry/vitals/route.ts`
4. `src/app/api/webhooks/cicd/route.ts`

**Acción por ruta:**

| Ruta | Veredicto | Acción |
|------|-----------|--------|
| `public/v1/intelligence` | Verificar | ¿Es una API pública intencional? Si sí, agregar rate limiting |
| `security/csp-report` | ✅ OK | Los reportes CSP son enviados por el navegador, no requiere auth |
| `telemetry/vitals` | Agregar auth | Agregar verificación de origen o API key |
| `webhooks/cicd` | ✅ Ya tiene firma HMAC | Verificar que `SCAUDIT_WEBHOOK_SECRET` esté configurado en Vercel |

**Verificación:**
```bash
grep -l "getUser\|getSession\|auth\|supabase\|isCronAuthorized\|verifyWebhook" \
  src/app/api/public/v1/intelligence/route.ts \
  src/app/api/telemetry/vitals/route.ts
```

---

### Tarea 1.4 — Configurar Headers de Seguridad
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 1h | **Archivos:** `src/middleware.ts`, `next.config.ts`

**Checklist de headers:**
- [ ] `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `X-Frame-Options: DENY`
- [ ] `Content-Security-Policy` (con nonce dinámico)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**Verificar en `src/middleware.ts`:**
```bash
grep -n "Strict-Transport\|X-Content-Type\|X-Frame\|Content-Security\|Referrer-Policy\|Permissions-Policy" \
  src/middleware.ts
```

---

### Tarea 1.5 — Auditar Variables de Entorno
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 2h | **Archivos:** `.env.local`, `.env.example`

**Checklist:**
- [ ] Ningún secreto hardcodeado en código fuente
- [ ] `.env.local` en `.gitignore`
- [ ] `.env.example` documenta todas las variables requeridas
- [ ] `NEXT_PUBLIC_*` no contiene secrets
- [ ] `SCAUDIT_WEBHOOK_SECRET` configurado en Vercel

**Comando de verificación:**
```bash
grep -rn "sk-\|secret\|password\|token\|key.*=" src/ --include="*.ts" --include="*.tsx" \
  | grep -v "test\|spec\|\.env\|process\.env\|node_modules\|SCAUDIT_WEBHOOK_SECRET" \
  | head -20
```

---

### Tarea 1.6 — Configurar Rate Limiting en Endpoints Críticos
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 2h | **Archivos:** Rutas de autenticación

**Endpoints que necesitan rate limiting:**
- `src/app/auth/callback/route.ts` — Login attempts
- `src/app/api/auth/validate-email/route.ts` — Email validation
- `src/app/api/ai/copilot/route.ts` — AI copilot
- `src/app/api/ai/report/route.ts` — AI reports

**Verificar configuración actual:**
```bash
grep -rn "ratelimit\|rate.*limit\|Ratelimit" src/ --include="*.ts" | head -20
```

---

## SEMANA 2: Calidad de Código 🧹

### Tarea 2.1 — Reemplazar console.* con Logger Estructurado
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 4h | **Archivos:** 59 instancias en ~20 archivos

**Crear `src/lib/logger.ts`:**
```typescript
// logger.ts — Wrapper sobre console con estructura
type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    ...context,
    timestamp: new Date().toISOString(),
  };
  
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};
```

**Archivos principales a actualizar:**
1. `src/app/actions/audits.ts` — 7 instancias
2. `src/app/actions/projects.ts` — 2 instancias
3. `src/app/api/ai/healthcheck/route.ts` — 5 instancias
4. `src/app/api/ai/report/route.ts` — 2 instancias
5. `src/app/api/api-keys/route.ts` — 3 instancias
6. `src/app/api/intelligence/adversary/route.ts` — 4 instancias
7. `src/app/api/intelligence/adversary/assessment/route.ts` — 4 instancias
8. `src/app/api/intelligence/adversary/mitre/route.ts` — 3 instancias

**Patrón de reemplazo:**
```typescript
// ❌ ANTES
console.error("Error al crear proyecto:", error);
console.warn("[Audit] Trigger.dev no disponible:", te?.message);

// ✅ DESPUÉS
import { logger } from "@/lib/logger";
logger.error("Error al crear proyecto", { error, projectId });
logger.warn("Trigger.dev no disponible, usando fallback", { error: te?.message });
```

---

### Tarea 2.2 — Refactorizar security/audit/page.tsx (1,403 LOC)
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 6h | **Archivo:** `src/app/security/audit/page.tsx`

**Estrategia de división:**

```
src/app/security/audit/
├── page.tsx                    ← Solo layout + routing (~100 LOC)
├── hooks/
│   ├── useAuditLogs.ts         ← Lógica de fetch de logs (~80 LOC)
│   └── useSecurityFilters.ts   ← Estado de filtros (~50 LOC)
├── components/
│   ├── AuditLogTable.tsx       ← Tabla de logs (~150 LOC)
│   ├── SecurityOverview.tsx    ← Panel de resumen (~120 LOC)
│   ├── RateLimitPanel.tsx      ← Panel de rate limits (~100 LOC)
│   └── CSPViolationsPanel.tsx  ← Panel de CSP (~100 LOC)
└── types.ts                    ← Tipos compartidos (~30 LOC)
```

**Pasos:**
1. Extraer tipos a `types.ts`
2. Extraer hooks custom a `hooks/`
3. Extraer componentes a `components/`
4. Dejar solo layout y composición en `page.tsx`

---

### Tarea 2.3 — Refactorizar IntelligenceTab.tsx (1,058 LOC)
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 4h | **Archivo:** `src/features/dashboard/tabs/IntelligenceTab.tsx`

**Estrategia:**
- IntelligenceTab.tsx → Layout principal (~150 LOC)
- intelligence/IntelligenceOverview.tsx → Resumen (~120 LOC)
- intelligence/ThreatMatrix.tsx → Matriz de amenazas (~100 LOC)
- intelligence/AssetList.tsx → Lista de activos (~100 LOC)
- intelligence/FindingCards.tsx → Tarjetas de hallazgos (~100 LOC)
- intelligence/hooks/useIntelligenceData.ts → Logica de datos (~80 LOC)

### Tarea 2.4 — Refactorizar MonitoringTab.tsx (983 LOC)
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 4h | **Archivo:** `src/features/dashboard/tabs/MonitoringTab.tsx`

**Estrategia:**
- MonitoringTab.tsx → Layout principal (~120 LOC)
- monitoring/UptimeChart.tsx → Grafico de uptime (~120 LOC)
- monitoring/AlertList.tsx → Lista de alertas (~100 LOC)
- monitoring/PerformanceMetrics.tsx → Metricas de rendimiento (~100 LOC)
- monitoring/hooks/useMonitoringData.ts → Logica de datos (~80 LOC)

### Tarea 2.5 — Refactorizar SettingsTab.tsx (979 LOC)
**Prioridad:** 🟡 ALTO | **Esfuerzo:** 4h | **Archivo:** `src/features/dashboard/tabs/SettingsTab.tsx`

**Estrategia:**
- SettingsTab.tsx → Layout principal (~100 LOC)
- settings/ProfileSettings.tsx → Configuracion de perfil (~120 LOC)
- settings/NotificationSettings.tsx → Configuracion de notificaciones (~100 LOC)
- settings/TeamSettings.tsx → Configuracion de equipo (~100 LOC)
- settings/BillingSettings.tsx → Configuracion de facturacion (~100 LOC)
- settings/hooks/useSettingsForm.ts → Logica de formularios (~80 LOC)

## SEMANA 3: Rendimiento y Base de Datos ⚡

### Tarea 3.1 — Agregar Paginación a Consultas
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 3h | **Archivos:** Múltiples rutas API

**Archivos sin paginación:**
1. `src/app/api/cron/uptime/route.ts:19` — `findMany({})` sin limit
2. `src/app/api/intelligence/assets/graph/route.ts:29-33` — `findMany({})` sin limit
3. `src/app/api/intelligence/bulk/route.ts:74` — `findFirst()` verificar
4. `src/app/api/cron/uptime/route.ts` — Projects sin paginación

**Patrón de paginación:**
```typescript
// ❌ ANTES
const activeProjects = await db.query.projects.findMany({
  where: and(isNull(projects.deletedAt), eq(projects.isDeleted, false)),
});

// ✅ DESPUÉS
const PAGE_SIZE = 100;
const activeProjects = await db.query.projects.findMany({
  where: and(isNull(projects.deletedAt), eq(projects.isDeleted, false)),
  limit: PAGE_SIZE,
  orderBy: [asc(projects.createdAt)],
});
```

---

### Tarea 3.2 — Migrar useEffect Fetch a React Query
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 4h | **Archivos:** Múltiples componentes

**Archivos con useEffect para fetch:**
1. `src/app/security/audit/page.tsx:1246` — `useEffect(() => { fetchLogs(...) })`
2. `src/app/settings/api-keys/ApiKeysDashboard.tsx:157` — `useEffect(() => { fetchKeys() })`
3. `src/features/dashboard/tabs/IntelligenceTab.tsx:142-186` — 4 useEffects
4. `src/features/dashboard/tabs/AdversaryTab.tsx:80` — useEffect
5. `src/features/dashboard/tabs/MarketplaceTab.tsx:87` — useEffect

**Patrón de migración:**
```typescript
// ❌ ANTES
function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchLogs(filters).then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, [filters]);
  
  if (loading) return <Skeleton />;
  return <AuditLogTable logs={logs} />;
}

// ✅ DESPUÉS
import { useQuery } from "@tanstack/react-query";

function AuditPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs", filters],
    queryFn: () => fetchLogs(filters),
    staleTime: 30_000,
  });
  
  if (isLoading) return <Skeleton />;
  return <AuditLogTable logs={logs} />;
}
```

---

### Tarea 3.3 — Verificar RLS en Todas las Tablas
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 3h | **Archivos:** Drizzle schemas, Supabase

**Tablas del proyecto (schemas Drizzle):**
- adversary, anomaly, health, history, intelligence, monitoring
- plugins, push-subscriptions, security-audit, teams, technologies, user-logs

**Verificar en Supabase SQL Editor:**
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

**Checklist por tabla:**
- [ ] `ENABLE ROW LEVEL SECURITY`
- [ ] Al menos una policy SELECT
- [ ] Al menos una policy INSERT/UPDATE (para escritura)

---

### Tarea 3.4 — Agregar Índices Faltantes
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 2h | **Archivos:** Drizzle schemas

**Índices a crear:**
```sql
CREATE INDEX idx_audits_project_id ON audits(project_id);
CREATE INDEX idx_audits_status ON audits(status);
CREATE INDEX idx_audits_created_at ON audits(created_at);
CREATE INDEX idx_intelligence_project_id ON intelligence_investigations(project_id);
CREATE INDEX idx_uptime_logs_project_id ON uptime_logs(project_id);
CREATE INDEX idx_uptime_logs_created_at ON uptime_logs(created_at);
```

---

### Tarea 3.5 — Optimizar Bundle Size
**Prioridad:** 🟢 BAJO | **Esfuerzo:** 2h | **Archivos:** `next.config.ts`, componentes

**Acciones:**
1. Dynamic imports para componentes pesados
2. Verificar imports circulares
3. Auditar dependencias pesadas

---

## SEMANA 4: Pruebas y DX 🧪

### Tarea 4.1 — Agregar Pruebas E2E para Flujos Críticos
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 6h | **Directorio:** `e2e/`

**Flujos críticos a cubrir:**
1. Login/Logout — `e2e/auth.spec.ts`
2. Crear proyecto — `e2e/project-create.spec.ts`
3. Ejecutar auditoría — `e2e/audit-run.spec.ts`
4. Ver reporte — `e2e/report-view.spec.ts`
5. Gestionar API keys — `e2e/api-keys.spec.ts`

---

### Tarea 4.2 — Agregar Pruebas de Contrato de API
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 4h | **Directorio:** `tests/api-contract/`

**Endpoints críticos:**
1. `GET /api/projects`
2. `POST /api/projects`
3. `GET /api/audits/:id`
4. `POST /api/ai/report`
5. `GET /api/intelligence`

---

### Tarea 4.3 — Aumentar Cobertura de Pruebas Unitarias
**Prioridad:** 🟡 MEDIO | **Esfuerzo:** 4h | **Directorio:** `src/`

**Prioridades de test:**
1. `src/shared/lib/ratelimit.ts` — Rate limiting logic
2. `src/shared/lib/actions.ts` — Server action wrapper
3. `src/server/auth/` — Authentication helpers
4. `src/modules/*/domain/` — Business logic

---

### Tarea 4.4 — Documentar API con JSDoc
**Prioridad:** 🟢 BAJO | **Esfuerzo:** 2h | **Archivos:** Todas las rutas API

---

## 📊 Seguimiento de Progreso

| Tarea | Semana | Estado |
|-------|--------|--------|
| 1.1 Actualizar dependencias | 1 | ⬜ Pendiente |
| 1.2 Sanitizar stack traces | 1 | ⬜ Pendiente |
| 1.3 Verificar auth en rutas | 1 | ⬜ Pendiente |
| 1.4 Headers de seguridad | 1 | ⬜ Pendiente |
| 1.5 Auditar env vars | 1 | ⬜ Pendiente |
| 1.6 Rate limiting | 1 | ⬜ Pendiente |
| 2.1 Logger estructurado | 2 | ⬜ Pendiente |
| 2.2 Refactorizar security/audit | 2 | ⬜ Pendiente |
| 2.3 Refactorizar IntelligenceTab | 2 | ⬜ Pendiente |
| 2.4 Refactorizar MonitoringTab | 2 | ⬜ Pendiente |
| 2.5 Refactorizar SettingsTab | 2 | ⬜ Pendiente |
| 3.1 Paginación en consultas | 3 | ⬜ Pendiente |
| 3.2 Migrar useEffect a React Query | 3 | ⬜ Pendiente |
| 3.3 Verificar RLS | 3 | ⬜ Pendiente |
| 3.4 Agregar índices | 3 | ⬜ Pendiente |
| 3.5 Optimizar bundle | 3 | ⬜ Pendiente |
| 4.1 Pruebas E2E | 4 | ⬜ Pendiente |
| 4.2 Pruebas de contrato | 4 | ⬜ Pendiente |
| 4.3 Cobertura unitaria | 4 | ⬜ Pendiente |
| 4.4 Documentar API | 4 | ⬜ Pendiente |

---

## 🎯 Métricas de Éxito

| Métrica | Actual | Objetivo | Plazo |
|---------|--------|----------|-------|
| Puntuación general | 72/100 | 90+/100 | 4 semanas |
| Vulnerabilidades CVE | 113 | 0 high/critical | Semana 1 |
| Archivos >500 LOC | 20 | <5 | Semana 2 |
| console.log en prod | 59 | 0 | Semana 2 |
| Pruebas E2E | 2 | 10+ | Semana 4 |
| Cobertura de dominio | ~40% | >80% | Semana 4 |

---

## 🚀 Comandos Útiles

```bash
# Auditoría completa
pnpm lint && npx tsc --noEmit && pnpm test

# Verificar vulnerabilidades
pnpm audit

# Ejecutar pruebas E2E
pnpm test:e2e

# Verificar cobertura
pnpm test:coverage

# Encontrar archivos grandes
find src/ -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Encontrar console.log
grep -rn "console\.\(log\|warn\|error\)" src/ --include="*.ts" --include="*.tsx" | grep -v test | wc -l
```

---

*Plan generado por Buffy basado en el Informe Consolidado de Auditoría*
