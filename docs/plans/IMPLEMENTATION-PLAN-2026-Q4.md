Plan Estratégico de Implementación — StrategicAudit Pro

# Plan Estratégico de Implementación — StrategicAudit Pro

**Fecha**: 2026-10-20  
**Versión**: 1.1 — sección 6.2 rescopeada a L2 Postgres sin Redis (2026-10-20)
**Estado**: Aprobado  
**Horizonte**: 10 semanas (4 sprints)

---

## Visión General

El proyecto **StrategicAudit Pro** ha completado **36/36 items** del roadmap original (Fases 0-4) y está en estado de producción confiable con:

- **2771 tests** (285 archivos, todos verdes)
- **Cobertura**: 58.8% líneas, 45.8% branches (muy por encima de umbrales CI)
- **Pool IA**: 3/3 proveedores activos (OpenRouter + Groq + Gemini failover)
- **Guards CI**: 7 core + extras (protegiendo superficie de seguridad)
- **Trigger.dev**: 34 tasks, 10 schedules, deploy verificado
- **Self-RUM**: Funcionando en producción con beacons activos
- **H-09 + H-10**: Cerrados (RUM + optimización bundle)
- **Deuda técnica**: Mínima (solo H-10b pendiente, gateado por datos de campo)

**Este plan organiza los próximos sprints** para añadir valor al producto, preparar la plataforma para escala, y cumplir con requisitos de compliance enterprise.

---

## Resumen Ejecutivo

| Sprint | Semanas | Objetivo Principal | Entregable Clave |
|--------|---------|-------------------|------------------|
| **Sprint 6** | 1-2 | Performance & Observabilidad | Plataforma preparada para escala |
| **Sprint 7** | 3-4 | Integraciones Avanzadas | OSINT + Webhooks + Background jobs |
| **Sprint 8** | 5-8 | Compliance & Governance | Dashboard compliance + SOC 2 prep |
| **Sprint 9** | 9-10 | Refinamiento & Documentación | Plataforma pulida y documentada |

**Total**: 10 semanas (2.5 meses)

---

## Sprint 6: Performance & Observabilidad (Semana 1-2)

### Objetivo
Preparar la plataforma para escala y dar visibilidad completa de uso en producción.

### Features del Sprint

| # | Feature | Esfuerzo | Prioridad | Entregable |
|---|---------|----------|-----------|------------|
| 6.1 | **Particionado de tablas** (uptime_logs, intelligence_findings) | 2-3 días | 🔴 ALTO | Tablas particionadas por mes, queries 5-10x más rápidas |
| 6.2 | **L2 distribuido de la caché de IA** (Postgres, sin Redis) | 0.5-1 día | 🔴 ALTO | Conectar `ai-cache` L1 (ya implementado) al L2 `distributed_cache` existente (ADR-008); cache compartida entre instancias |
| 6.3 | **Optimización de queries lentas** | 2-3 días | 🟡 MEDIO | EXPLAIN ANALYZE de top 10 queries, índices compuestos |
| 6.4 | **CDN para assets estáticos** | 1 día | 🟡 MEDIO | Cloudflare/Vercel Edge configurado, LCP mejorado |
| 6.5 | **Dashboard de uso de la plataforma** | 3-4 días | 🔴 ALTO | /admin/usage con usuarios activos, proyectos, auditorías |

### Dependencias y Orden de Ejecución
6.1 Particionado de tablas (primero - afecta schema)
↓
6.3 Optimización de queries (después - queries ya optimizadas)
↓
6.2 Caché de IA — L2 distribuido en Postgres (sin Redis) (paralelo - independiente)
↓
6.4 CDN (paralelo - independiente)
↓
6.5 Dashboard de uso (último - usa datos ya optimizados)


### Entregables Técnicos

#### 6.1 Particionado de Tablas

```sql
-- Migración: drizzle/00XX_partitioning.sql

-- Particionado de uptime_logs
CREATE TABLE uptime_logs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  checked_at TIMESTAMPTZ NOT NULL,
  response_time_ms INTEGER,
  status_code INTEGER
) PARTITION BY RANGE (checked_at);

-- Particiones mensuales automáticas
CREATE TABLE uptime_logs_2026_10 PARTITION OF uptime_logs
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');

-- Trigger para crear particiones futuras
CREATE OR REPLACE FUNCTION create_uptime_logs_partition()
RETURNS TRIGGER AS $$
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS uptime_logs_%s PARTITION OF uptime_logs FOR VALUES FROM (%L) TO (%L)',
    to_char(NEW.checked_at, 'YYYY_MM'),
    date_trunc('month', NEW.checked_at),
    date_trunc('month', NEW.checked_at) + interval '1 month'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_partition
BEFORE INSERT ON uptime_logs
FOR EACH ROW EXECUTE FUNCTION create_uptime_logs_partition();

Beneficios:
Queries de WHERE checked_at > now() - interval '7 days' solo escanean la partición relevante
Retención eficiente: DROP TABLE uptime_logs_2026_01 en vez de DELETE masivo
Mantenimiento: VACUUM por partición sin bloquear toda la tabla

6.2 Caché de IA — L2 distribuido en Postgres (sin Redis)

> **Actualizado 2026-10-20 (versión 1.1 de esta sección).** La caché semántica
> de IA ya existe como L1 en memoria: `src/server/ai/ai-cache.ts` (P1-3),
> integrada en `ai-router.ts` con clave `sha256(taskType + scope + mensajes)`,
> TTL por task (`seo-report`/`exec-brief` 24h, `finding-triage` 6h, resto 1h),
> métricas de hit-rate en `/ai/health` e invalidación por scope desde
> `audit.trigger.ts`. El proyecto eliminó Upstash/Redis (ADR-002, enmiendas
> 14-15), por lo que el snippet original de esta sección (Redis/Upstash) queda
> descartado. Lo que queda por hacer es conectar el L1 al L2 distribuido ya
> existente en Postgres (`src/shared/lib/distributed-cache.ts`, tabla
> `distributed_cache`, ADR-008 C2), para que la caché sobreviva a deploys y se
> comparta entre instancias serverless — hoy solo acelera repetición dentro de
> la misma instancia caliente (documentado en el propio encabezado de
> `ai-cache.ts`).

```ts
// src/server/ai/ai-cache.ts — conector L2 (único cambio, aditivo)
import {
  cacheGet,
  cacheSet,
  isDistributedCacheEnabled,
} from "@/shared/lib/distributed-cache";

async function lookupSemanticCache(key: string): Promise<CacheHit | null> {
  const now = Date.now();
  const mem = memory.get(key);
  if (mem && mem.expiresAt > now) {
    return { content: mem.content, modelId: mem.modelId };
  }
  if (mem) memory.delete(key);
  // L2 (el propio store ya es fail-open): sólo activo con CACHE_STORE=postgres,
  // por lo que dev/test siguen en memoria pura, sin I/O en las suites.
  if (isDistributedCacheEnabled()) {
    const l2 = await cacheGet<CacheHit>(key);
    if (l2 && l2.expiresAt > now) {
      return { content: l2.content, modelId: l2.modelId };
    }
  }
  return null;
}

export async function setSemanticCache(
  key: string,
  content: string,
  modelId: string,
  taskType: AITaskType
): Promise<void> {
  const ttlSec = ttlFor(taskType);
  // ...(desalojo L1 sin cambios)
  memory.set(key, { content, modelId, expiresAt: Date.now() + ttlSec * 1000 });
  if (isDistributedCacheEnabled()) {
    await cacheSet(
      key,
      { content, modelId, expiresAt: Date.now() + ttlSec * 1000 },
      ttlSec * 1000
    );
  }
}
```

Esfuerzo: **0.5-1 día** (antes 2 días). Cero dependencias nuevas y cero
credenciales: usa el mismo `DATABASE_URL` (REQ-4 del ADR-008). El L2 ya
garantiza fail-open (ante error → miss), purga por expiración (`purgeExpired`)
y tiene 16 tests sobre PGlite (`tests/platform/platform-cache-queue.test.ts`).

Beneficios:
- Reduce costos de API 40-60% (prompts repetidos como "analizar este finding")
- El L1 golpea primero (latencia ~0); el L2 añade una query indexada por `key`
  (unos ms) vs 1-3s de llamada IA real; la cache ahora sobrevive a cold starts
  y deploys
- Anti-reintentos duplicados (sirve el mismo resultado del job mientras su TTL
  siga vigente, sin volver a consumir free tiers de OpenRouter/Groq/Gemini)

Guardas y cautelas del alcance:
- `ai-cache.ts` y `ai-router.ts` son el pool de IA (zona vetada): requiere
  aprobación explícita del owner antes de editar.
- Política de claves del ADR-008 §7 ("tool + target público, nunca dato de
  tenant"): las claves AI incluyen scope con `projectId`; la tabla está
  protegida (RLS sin policies, acceso sólo vía `directDb`, mismo patrón que
  `rate_limit_windows`) — se documenta como enmienda menor al ADR-008.
- Corregir el comentario obsoleto de `ai-router.ts` (~línea 338, "L1 memoria +
  L2 Redis") al escribir el conector.
- Tests nuevos en `ai-cache.test.ts`: hit cross-instancia (evacuar el Map y
  servir desde el L2) y fail-open si el store falla.

Criterio de aceptación:
- Con `CACHE_STORE=postgres`: dos ejecuciones del mismo taskType + scope +
  mensajes (distinta instancia simulada en test) → 1 miss + 1 hit.
- Sin Redis, sin dependencias nuevas en `package.json` y sin secrets nuevos.
- `pnpm typecheck`, `pnpm test` y guardas verde; métrica `hitRate` refleja el
  hit del L2 en `/ai/health`.

6.3 Optimización de Queries Lentas
sql
-- Análisis con EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM intelligence_findings
WHERE project_id = $1 AND severity = 'critical'
ORDER BY created_at DESC
LIMIT 100;

-- Índices compuestos sugeridos
CREATE INDEX CONCURRENTLY idx_findings_project_severity_date
ON intelligence_findings(project_id, severity, created_at DESC);

CREATE INDEX CONCURRENTLY idx_uptime_logs_project_checked
ON uptime_logs(project_id, checked_at DESC);

CREATE INDEX CONCURRENTLY idx_audit_logs_user_project_date
ON security_audit_logs(user_id, project_id, created_at DESC);

Métricas objetivo:
Top 10 queries: < 100ms (vs 500ms-2s actuales)
Index Scan en vez de Seq Scan para queries con WHERE clause
Buffer hit rate > 95%
6.4 CDN para Assets Estáticos
javascript

// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.scaudit.com', // CDN dedicado
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

// src/app/admin/usage/page.tsx
import { db } from '@/shared/db';
import { sql } from 'drizzle-orm';

async function getUsageMetrics() {
  const [users, projects, audits, findings] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(users),
    db.select({ count: sql<number>`count(*)` }).from(projects),
    db.select({ count: sql<number>`count(*)` }).from(audits),
    db.select({ count: sql<number>`count(*)` }).from(intelligence_findings),
  ]);
  
  const activeUsersLast7Days = await db
    .select({ count: sql<number>`count(DISTINCT user_id)` })
    .from(security_audit_logs)
    .where(sql`created_at > now() - interval '7 days'`);
  
  return {
    totalUsers: users[0].count,
    totalProjects: projects[0].count,
    totalAudits: audits[0].count,
    totalFindings: findings[0].count,
    activeUsersLast7Days: activeUsersLast7Days[0].count,
  };
}

export default async function UsageDashboard() {
  const metrics = await getUsageMetrics();
  
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Platform Usage</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard title="Total Users" value={metrics.totalUsers} />
        <MetricCard title="Active Users (7d)" value={metrics.activeUsersLast7Days} />
        <MetricCard title="Total Projects" value={metrics.totalProjects} />
        <MetricCard title="Total Audits" value={metrics.totalAudits} />
      </div>
      
      <UsageCharts data={metrics} />
    </div>
  );
}

Métricas a trackear:
Usuarios activos (DAU/WAU/MAU)
Proyectos creados por día
Auditorías ejecutadas por día
Findings detectados por severidad
Uso de IA (tokens consumidos, modelos usados)
API keys activas y requests
Criterios de Éxito
✅ Queries de uptime_logs y intelligence_findings < 100ms (vs 500ms-2s actuales)
✅ Cache hit rate > 60% para prompts de IA repetidos (medido vía cacheMetrics() en /ai/health; L2 verificado con tests PGlite + hit cross-instancia)
✅ CDN activo en producción (headers X-Cache: HIT)
✅ Dashboard muestra métricas de uso en tiempo real
✅ Sin regresiones en tests (2771 tests verdes)
Sprint 7: Integraciones Avanzadas (Semana 3-4)
Objetivo
Conectar la plataforma con el ecosistema de seguridad y fuentes de datos externas.
Features del Sprint
#
Feature
Esfuerzo
Prioridad
Entregable
7.1
Más fuentes OSINT (VirusTotal, AlienVault OTX, Shodan API)
3-4 días
🔴 ALTO
3 nuevos executors, datos enriquecidos en findings
7.2
Webhooks para integraciones
2-3 días
🟡 MEDIO
/settings/webhooks con CRUD + delivery logs
7.3
Exportación a DOCX/ODT
2 días
🟢 BAJO
Además de PDF/CSV/JSON, exportar a Word/LibreOffice
7.4
Background jobs con Trigger.dev (tareas pesadas)
3-4 días
🟡 MEDIO
PDF generation, análisis de IA grandes en background
Dependencias y Orden de Ejecución

7.1 Fuentes OSINT (primero - enriquece datos)
    ↓
7.2 Webhooks (paralelo - independiente)
    ↓
7.3 Exportación DOCX/ODT (paralelo - independiente)
    ↓
7.4 Background jobs (último - usa todo lo anterior)

Entregables Técnicos
7.1 Fuentes OSINT
typescript

// src/server/intelligence/executors/virustotal.ts
import { ToolExecutor } from '../core/types';

interface VirusTotalInput {
  domain: string;
  apiKey: string;
}

interface VirusTotalOutput {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  lastAnalysisDate: string;
  communityScore: number;
  permalink: string;
}

export const virustotalExecutor: ToolExecutor<
  VirusTotalInput,
  VirusTotalOutput
> = async ({ domain, apiKey }) => {
  const response = await fetch(
    `https://www.virustotal.com/api/v3/domains/${domain}`,
    {
      headers: { 'x-apikey': apiKey },
    }
  );
  
  if (!response.ok) {
    throw new Error(`VirusTotal API error: ${response.status}`);
  }
  
  const data = await response.json();
  const stats = data.data.attributes.last_analysis_stats;
  
  return {
    malicious: stats.malicious,
    suspicious: stats.suspicious,
    harmless: stats.harmless,
    undetected: stats.undetected,
    lastAnalysisDate: data.data.attributes.last_analysis_date,
    communityScore: data.data.attributes.reputation,
    permalink: data.data.links.self,
  };
};

// Registrar en tool-registry.ts
registerTool({
  id: 'osint.virustotal',
  name: 'VirusTotal Domain Check',
  description: 'Check domain reputation against 70+ antivirus engines',
  executor: virustotalExecutor,
  inputSchema: z.object({
    domain: z.string(),
    apiKey: z.string(),
  }),
});


Fuentes a integrar:
VirusTotal: Reputación de dominios/IPs (70+ engines)
AlienVault OTX: Threat intelligence feeds, indicadores de compromiso
Shodan API: Puertos abiertos, servicios expuestos, vulnerabilidades conocidas
7.2 Webhooks para Integraciones

// src/server/webhooks/delivery.ts
import { webhooks, webhookDeliveries } from '@/shared/db/schemas';
import { db } from '@/shared/db';
import { eq } from 'drizzle-orm';

export async function deliverWebhook(
  webhookId: string,
  event: string,
  payload: any
): Promise<void> {
  const webhook = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.id, webhookId))
    .limit(1)
    .then(rows => rows[0]);

  if (!webhook || !webhook.active) return;

  const maxRetries = 3;
  let attempt = 0;
  let success = false;
  let lastError: string | null = null;

  while (attempt < maxRetries && !success) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': webhook.secret,
          'X-Webhook-Event': event,
          'X-Webhook-Delivery': crypto.randomUUID(),
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          payload,
        }),
      });

      success = response.ok;
      lastError = success ? null : `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    attempt++;
    if (!success && attempt < maxRetries) {
      // Exponential backoff: 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  // Registrar delivery
  await db.insert(webhookDeliveries).values({
    webhookId,
    event,
    payload,
    success,
    attempts: attempt,
    lastError,
    deliveredAt: new Date(),
  });
}

// Eventos disponibles
export const WEBHOOK_EVENTS = [
  'audit.completed',
  'finding.critical',
  'project.created',
  'intelligence.scan_completed',
  'adversary.simulation_completed',
] as const;

UI: /settings/webhooks con:
Lista de webhooks configurados
Formulario de creación (URL, secret, eventos suscritos)
Logs de delivery (éxitos/fallos, timestamps, payloads)
Botón "Test Webhook" para verificar conectividad
7.3 Exportación a DOCX/ODT

// src/server/reports/docx-export.ts
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import fs from 'fs';

export async function generateDocxReport(auditId: string): Promise<Buffer> {
  const audit = await getAuditWithFindings(auditId);
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: audit.project.name,
          heading: HeadingLevel.TITLE,
        }),
        new Paragraph({
          text: `Audit Report - ${new Date().toLocaleDateString()}`,
          heading: HeadingLevel.HEADING_1,
        }),
        new Paragraph({
          text: 'Executive Summary',
          heading: HeadingLevel.HEADING_2,
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: audit.summary || 'No summary available',
            }),
          ],
        }),
        // ... más secciones (findings, recommendations, etc.)
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// Endpoint
// src/app/api/reports/docx/route.ts
import { NextResponse } from 'next/server';
import { generateDocxReport } from '@/server/reports/docx-export';

export async function POST(request: Request) {
  const { auditId } = await request.json();
  
  const buffer = await generateDocxReport(auditId);
  
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="audit-report-${auditId}.docx"`,
    },
  });
}

Formatos soportados:
DOCX: Microsoft Word (Office 2007+)
ODT: LibreOffice/OpenDocument
RTF: Rich Text Format (universal)
7.4 Background Jobs con Trigger.dev

// src/trigger/pdf-generation.trigger.ts
import { task } from '@trigger.dev/sdk';

export const generatePdfReport = task({
  id: 'generate-pdf-report',
  run: async (payload: { auditId: string; userId: string }) => {
    const { auditId, userId } = payload;
    
    // 1. Obtener datos de la auditoría
    const audit = await getAuditWithFindings(auditId);
    
    // 2. Generar PDF (puede tomar 10-30 segundos)
    const pdfBuffer = await generatePdfReport(audit);
    
    // 3. Subir a storage (S3, GCS, o Supabase Storage)
    const fileUrl = await uploadToStorage(pdfBuffer, `reports/${auditId}.pdf`);
    
    // 4. Notificar al usuario
    await notifyUser(userId, {
      type: 'report_ready',
      message: `Your audit report is ready`,
      downloadUrl: fileUrl,
    });
    
    return { success: true, fileUrl };
  },
});

// Disparar desde el UI
// src/app/components/DownloadPdfButton.tsx
import { generatePdfReport } from '@/trigger/pdf-generation.trigger';

export function DownloadPdfButton({ auditId }: { auditId: string }) {
  const [status, setStatus] = useState<'idle' | 'generating' | 'ready'>('idle');
  
  const handleGenerate = async () => {
    setStatus('generating');
    
    // Disparar job en background
    await generatePdfReport.trigger({
      auditId,
      userId: currentUser.id,
    });
    
    // Polling para verificar cuando está listo
    // (o WebSocket para notificación en tiempo real)
  };
  
  return (
    <button onClick={handleGenerate} disabled={status === 'generating'}>
      {status === 'generating' ? 'Generating...' : 'Generate PDF'}
    </button>
  );
}
Tareas pesadas a mover a background:
Generación de PDFs grandes (>50 páginas)
Análisis de IA de grandes volúmenes de datos
Escaneos de inteligencia completos (cientos de dominios)
Exportación de datos masivos (CSV con >10K filas)
Criterios de Éxito
✅ VirusTotal, AlienVault OTX, Shodan integrados como executors
✅ Webhooks configurables con retry logic y delivery logs
✅ Exportación a DOCX/ODT funcional
✅ PDF generation en background (no bloquea UI)
✅ Tests de integración con APIs externas (mocks + live tests)
Sprint 8: Compliance & Governance (Semana 5-8)
Objetivo
Preparar la plataforma para auditorías de compliance y uso enterprise.
Features del Sprint
#
Feature
Esfuerzo
Prioridad
Entregable
8.1
Dashboard de compliance (ISO 27001, SOC 2, PCI DSS)
4-5 días
🔴 ALTO
Mapeo de findings a controles, gap analysis
8.2
Connection pooling (PgBouncer)
1 día
🟢 BAJO
Si hay problemas de conexión
8.3
SOC 2 Type II preparation (inicio)
2-3 meses
🟡 MEDIO
Políticas, procedimientos, documentación
Dependencias y Orden de Ejecución

8.2 Connection pooling (primero - si aplica)
    ↓
8.1 Dashboard de compliance (principal - 4-5 días)
    ↓
8.3 SOC 2 Type II (largo plazo - 2-3 meses)

Entregables Técnicos
8.1 Dashboard de Compliance

// src/shared/data/compliance-mapping.ts
export const COMPLIANCE_MAPPING = {
  'ISO27001': {
    'A.12.6.1': {
      name: 'Management of technical vulnerabilities',
      description: 'Information about technical vulnerabilities shall be obtained in a timely manner',
      controls: ['patch-management', 'vulnerability-scanning'],
      findings: ['outdated-software', 'unpatched-cve', 'missing-security-updates'],
    },
    'A.12.4.1': {
      name: 'Event logging',
      description: 'Event logs shall be produced, kept, protected, and regularly reviewed',
      controls: ['audit-logging', 'log-monitoring', 'log-retention'],
      findings: ['missing-logs', 'insufficient-logging', 'no-log-retention'],
    },
    'A.14.2.1': {
      name: 'Secure development policy',
      description: 'Rules for the development of software shall be established and applied',
      controls: ['secure-coding', 'code-review', 'security-testing'],
      findings: ['insecure-code', 'no-code-review', 'missing-security-tests'],
    },
    // ... más controles ISO 27001
  },
  'SOC2': {
    'CC6.1': {
      name: 'Logical and physical access controls',
      description: 'The entity implements logical access security software and infrastructure',
      controls: ['access-control', 'authentication', 'authorization'],
      findings: ['weak-passwords', 'missing-mfa', 'no-access-logs'],
    },
    'CC7.2': {
      name: 'System monitoring',
      description: 'The entity monitors system components for anomalies',
      controls: ['monitoring', 'alerting', 'incident-response'],
      findings: ['no-monitoring', 'missing-alerts', 'no-incident-response'],
    },
    // ... más controles SOC 2
  },
  'PCIDSS': {
    '6.5': {
      name: 'Address common coding vulnerabilities',
      description: 'Address common coding vulnerabilities in software-development processes',
      controls: ['secure-coding', 'input-validation', 'output-encoding'],
      findings: ['sql-injection', 'xss', 'command-injection'],
    },
    '11.2': {
      name: 'Run network vulnerability scans',
      description: 'Run internal and external network vulnerability scans at least quarterly',
      controls: ['vulnerability-scanning', 'penetration-testing'],
      findings: ['no-scanning', 'unpatched-vulnerabilities'],
    },
    // ... más controles PCI DSS
  },
};

// src/server/compliance/gap-analysis.ts
export function analyzeComplianceGaps(
  findings: Finding[],
  framework: 'ISO27001' | 'SOC2' | 'PCIDSS'
): ComplianceReport {
  const mapping = COMPLIANCE_MAPPING[framework];
  const report: ComplianceReport = {
    framework,
    totalControls: Object.keys(mapping).length,
    coveredControls: 0,
    gaps: [],
    coverage: 0,
  };
  
  // Mapear findings a controles
  const findingTypes = new Set(findings.map(f => f.type));
  
  for (const [controlId, control] of Object.entries(mapping)) {
    const hasRelatedFinding = control.findings.some(f => findingTypes.has(f));
    
    if (hasRelatedFinding) {
      report.coveredControls++;
    } else {
      report.gaps.push({
        controlId,
        name: control.name,
        description: control.description,
        requiredControls: control.controls,
      });
    }
  }
  
  report.coverage = (report.coveredControls / report.totalControls) * 100;
  
  return report;
}

UI: /compliance con:
Selector de framework (ISO 27001, SOC 2, PCI DSS)
Dashboard de cobertura (% de controles cubiertos)
Lista de gaps (controles sin implementar)
Recomendaciones por gap
Exportar reporte de compliance en PDF
8.2 Connection Pooling (PgBouncer)

# pgbouncer.ini
[databases]
scaudit = host=db.supabase.co port=5432 dbname=postgres

[pgbouncer]
listen_port = 6432
listen_addr = *
auth_type = md5
auth_file = userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 20
reserve_pool_size = 5
reserve_pool_timeout = 3

Cuándo implementar:
Si hay errores de conexión (too many clients)
Si el número de conexiones activas > 80% del límite de Supabase
Si hay latencia alta en queries simples (<10ms esperado, >100ms real)
Beneficios:
Reduce overhead de conexión (reutiliza conexiones existentes)
Previene agotamiento de conexiones en Supabase (límite de 500 en free tier)
Mejora latencia de queries cortas
8.3 SOC 2 Type II Preparation
Fase 1: Políticas y Procedimientos (1 mes)
Política de seguridad de la información
Política de gestión de accesos
Política de gestión de cambios
Política de respuesta a incidentes
Procedimientos de onboarding/offboarding
Fase 2: Implementación de Controles (2 meses)
Auditoría de accesos (quién accedió a qué, cuándo)
Logs de cambios en configuración
Pruebas de penetración externas
Revisión de código por pares
Backup y disaster recovery
Fase 3: Auditoría Externa (1 mes)
Selección de auditor (AICPA accredited)
Recopilación de evidencia
Entrevistas con equipo
Reporte final
Costo estimado: $15K-50K USD (auditoría + preparación)
Criterios de Éxito
✅ Dashboard de compliance con mapeo a ISO 27001, SOC 2, PCI DSS
✅ Gap analysis automático (qué controles faltan)
✅ Reportes de compliance en PDF
✅ PgBouncer configurado (si aplica)
✅ Documentación de políticas y procedimientos (inicio de SOC 2)
Sprint 9: Refinamiento y Documentación (Semana 9-10)
Objetivo
Pulir la plataforma, documentar todo y preparar para el siguiente ciclo.
Features del Sprint
#
Feature
Esfuerzo
Prioridad
Entregable
9.1
Documentación técnica actualizada
2-3 días
🔴 ALTO
Manuals HTML actualizados con nuevas features
9.2
Video tutoriales
3-4 días
🟢 BAJO
YouTube/Loom con demos de features principales
9.3
Performance review final
2 días
🟡 MEDIO
Lighthouse 90+ en todas las páginas
9.4
Security review
2-3 días
🔴 ALTO
Pentest interno, revisión de dependencias
Entregables Técnicos
9.1 Documentación Técnica Actualizada
Archivos a actualizar:
docs/html/manual-instalacion.html: Nuevas variables de entorno (Redis, OSINT APIs)
docs/html/manual-usuario.html: Nuevas features (compliance, webhooks, OSINT)
docs/html/manual-funcionamiento.html: Nueva arquitectura (particionado, cache, background jobs)
README.md: Estado actualizado con métricas del Sprint 6-8
Nuevos documentos:
docs/guides/compliance.md: Guía de uso del dashboard de compliance
docs/guides/webhooks.md: Cómo configurar webhooks para integraciones
docs/guides/osint-integrations.md: Configuración de VirusTotal, AlienVault, Shodan
9.2 Video Tutoriales
Videos a producir:
Introducción a SCAUDIT Pro (5 min): Overview de la plataforma
Creación de primer proyecto (10 min): Desde cero hasta primer escaneo
Dashboard de compliance (15 min): Cómo usar ISO 27001, SOC 2, PCI DSS
Integraciones OSINT (10 min): Configuración de VirusTotal, Shodan
Webhooks para CI/CD (10 min): Automatización de escaneos
Reportes automáticos (10 min): Configuración de reportes programados
Plataforma: YouTube (público) + Loom (interno para clientes)
9.3 Performance Review Final
# Lighthouse CI para todas las páginas
lighthouse https://scaudit.vercel.app/ --output=json --output-path=./reports/home.json
lighthouse https://scaudit.vercel.app/login --output=json --output-path=./reports/login.json
lighthouse https://scaudit.vercel.app/pricing --output=json --output-path=./reports/pricing.json

# Objetivo: score > 90 en todas las páginas
# Métricas objetivo:
# - LCP < 2.5s
# - FID < 100ms
# - CLS < 0.1
# - TTFB < 600ms
Optimizaciones a aplicar:
Image optimization (WebP, lazy loading)
Font subsetting (solo caracteres usados)
Code splitting agresivo (dynamic imports)
Prefetching de rutas críticas
9.4 Security Review
# 1. Auditoría de dependencias
pnpm audit
npx snyk test

# 2. Revisión de secrets
npx trufflehog filesystem --directory .

# 3. Pentest interno
npx zap-baseline.py -t https://scaudit.vercel.app -r pentest-report.html

# 4. Revisión de código (OWASP Top 10)
# - SQL Injection
# - XSS
# - CSRF
# - Insecure Direct Object References
# - Security Misconfiguration

Checklist de seguridad:
Todas las variables de entorno en .env.example (sin valores reales)
.env.local y .env en .gitignore
No hay secrets hardcodeados en el código
Rate limiting en todos los endpoints públicos
CSP configurado correctamente
RLS habilitado en todas las tablas
Validación de input en todos los endpoints
Sanitización de output (XSS prevention)
Criterios de Éxito
✅ Documentación HTML actualizada
✅ Videos tutoriales publicados
✅ Lighthouse 90+ en todas las páginas
✅ Security review completado
✅ Roadmap actualizado para el siguiente ciclo
Métricas de Éxito Globales
Performance
Métrica
Antes (Sprint 5)
Después (Sprint 9)
Mejora
LCP (landing page)
3.76s
< 2.5s
-34%
TBT (landing page)
1.408ms
< 300ms
-79%
Queries lentas (>500ms)
~20
< 5
-75%
Cache hit rate (IA)
0%
> 60%
+60%
Bundle size (landing)
1.324 KB
< 1 MB
-24%
Funcionalidad
Métrica
Antes
Después
Mejora
Fuentes OSINT
1 (Shodan)
4 (+VirusTotal, OTX, Shodan API)
+300%
Formatos de exportación
3 (PDF, CSV, JSON)
6 (+DOCX, ODT, RTF)
+100%
Integraciones (webhooks)
0
∞ (configurables)
—
Frameworks de compliance
0
3 (ISO 27001, SOC 2, PCI DSS)
+3
Calidad
Métrica
Antes
Después
Mejora
Tests totales
2771
3200+
+429
Cobertura de líneas
58.8%
65%+
+6.2%
Lighthouse score (avg)
75
90+
+15
Security vulnerabilities
TBD
0 (criticales)
-100%
Timeline Consolidado
Semana
Sprint
Features Principales
Entregable Clave
1
Sprint 6
Particionado, Cache IA, Optimización queries
BD optimizada
2
Sprint 6
CDN, Dashboard de uso
Observabilidad completa
3
Sprint 7
OSINT (VirusTotal, OTX, Shodan)
Datos enriquecidos
4
Sprint 7
Webhooks, DOCX/ODT, Background jobs
Integraciones avanzadas
5
Sprint 8
Dashboard de compliance (ISO 27001)
Gap analysis
6
Sprint 8
Dashboard de compliance (SOC 2, PCI DSS)
Reportes de compliance
7
Sprint 8
Connection pooling (si aplica)
Performance BD
8
Sprint 8
SOC 2 prep (políticas)
Documentación de políticas
9
Sprint 9
Documentación actualizada, Videos tutoriales
Contenido educativo
10
Sprint 9
Performance review, Security review
Plataforma pulida
Próximos Pasos Inmediatos
Semana 1 (Sprint 6, Fase 1)
Día 1-2: Particionado de tablas
Analizar queries actuales de uptime_logs y intelligence_findings
Diseñar esquema de particionado (por mes, con trigger automático)
Crear migración drizzle/00XX_partitioning.sql
Aplicar en staging y verificar performance
Deploy a producción
Día 3: Optimización de queries
Ejecutar EXPLAIN ANALYZE en top 10 queries lentas
Identificar Seq Scans que deberían ser Index Scans
Crear índices compuestos donde aplique
Verificar mejora con benchmarks
Día 4-5: L2 de la caché de IA (Postgres, sin Redis)
Conectar `ai-cache.ts` (L1 ya existente) al L2 `distributed_cache` vía `cacheGet`/`cacheSet` de `distributed-cache.ts`
Cache first ya integrado en ai-router.ts; el conector es aditivo (L1 → L2)
Métricas de cache hit/miss ya existen (cacheMetrics(), visibles en /ai/health)
Tests de cache en ai-cache.test.ts: hit cross-instancia (L2), miss y expiry
Checklist de Inicio
Reutilizar `distributed_cache` para el L2 de la caché IA — no requiere Redis/Upstash ni cuenta nueva (ADR-008)
Obtener API keys de VirusTotal, AlienVault OTX, Shodan
Configurar CDN (Cloudflare o Vercel Edge)
Revisar queries lentas con EXPLAIN ANALYZE
Definir métricas de compliance a trackear
Recursos y Referencias
Documentación Interna
ROADMAP.md — Plan de mejora continua
CHANGELOG.md — Historial de cambios
FINAL-SUMMARY.md — Estado actual del proyecto
AI-CONNECTIONS-REPORT.md — Estado del pool de IA
Documentación Externa
Next.js 16 Documentation
Drizzle ORM Documentation
Supabase Documentation
Trigger.dev Documentation
PostgreSQL Partitioning
Herramientas
Postgres `distributed_cache` — caché distribuida ya existente (ADR-008, sin Redis)
Cloudflare — CDN y seguridad
VirusTotal API — OSINT
AlienVault OTX — Threat intelligence
Shodan API — Internet scanning
Glosario
Término
Definición
OSINT
Open Source Intelligence — fuentes de datos públicas
SIEM
Security Information and Event Management
RLS
Row Level Security — seguridad a nivel de fila en PostgreSQL
CWV
Core Web Vitals — métricas de performance de Google
LCP
Largest Contentful Paint — tiempo de carga del contenido principal
TBT
Total Blocking Time — tiempo total de bloqueo del hilo principal
SOC 2
Service Organization Control 2 — estándar de auditoría de seguridad
ISO 27001
Estándar internacional de gestión de seguridad de la información
PCI DSS
Payment Card Industry Data Security Standard
CDN
Content Delivery Network — red de distribución de contenido
PgBouncer
Connection pooler para PostgreSQL
Contacto y Soporte
Equipo de desarrollo: StrategicConnex Team
Email: dev@strategicconnex.com
GitHub: @StrategicConnex
Sitio web: scaudit.vercel.app
Licencia
MIT © StrategicConnex
Documento generado: 2026-10-20
Próxima revisión: 2026-12-20 (al completar Sprint 9)
<p align="center">
<sub>Built with ❤️ by the StrategicConnex Team</sub><br>
<sub>© 2026 StrategicConnex — Enterprise Cyber Intelligence</sub>
</p>

equisito integrado: Disclaimer inicial con hoja de ruta pública fechada
Buena decisión de transparencia: el disclaimer es la primera pantalla que ve todo visitante, así que publicar ahí las mejoras con fechas convierte la barrera legal en un compromiso visible. Lo integro al plan con tres entregables: contenido, diseño técnico y ubicación en el cronograma.
📅 Tabla de fechas estimadas (formato día mes año)
Calculadas desde el inicio del Sprint 6 (martes 20 de octubre de 2026), 10 semanas:
Grupo de mejora
Mejora concreta
Fecha estimada
Rendimiento y observabilidad
Particionado de tablas de historial
21 de octubre de 2026
Optimización de queries lentas
22 de octubre de 2026
Caché de respuestas de IA
24 de octubre de 2026
CDN para assets estáticos
27 de octubre de 2026
Panel de uso de la plataforma
2 de noviembre de 2026
Integraciones avanzadas
Fuentes OSINT (VirusTotal, AlienVault OTX, Shodan)
6 de noviembre de 2026
Webhooks para integraciones externas
11 de noviembre de 2026
Exportación de reportes a DOCX/ODT
13 de noviembre de 2026
Reportes pesados en segundo plano
16 de noviembre de 2026
Cumplimiento y gobernanza
Panel de cumplimiento ISO 27001
21 de noviembre de 2026
Cobertura SOC 2 y PCI DSS en el panel
28 de noviembre de 2026
Connection pooling (si aplica)
5 de diciembre de 2026
Inicio preparación SOC 2 Type II (políticas)
14 de diciembre de 2026
Refinamiento y documentación
Documentación técnica actualizada
17 de diciembre de 2026
Videos tutoriales
22 de diciembre de 2026
Revisión final de rendimiento
24 de diciembre de 2026
Revisión final de seguridad
28 de diciembre de 2026
📝 Contenido propuesto del disclaimer (ES)
Se añade como sección colapsable dentro de la barrera existente (el aviso legal y el botón de aceptación no cambian):

HOJA DE RUTA PÚBLICA (fechas estimadas)

Rendimiento y observabilidad
· 21 de octubre de 2026 — Particionado de tablas de historial (consultas más rápidas)
· 24 de octubre de 2026 — Caché de respuestas de IA (menor latencia)
· 27 de octubre de 2026 — CDN para assets estáticos
· 2 de noviembre de 2026 — Panel de uso de la plataforma

Integraciones avanzadas
· 6 de noviembre de 2026 — Nuevas fuentes OSINT: VirusTotal, AlienVault OTX, Shodan
· 11 de noviembre de 2026 — Webhooks para integraciones externas
· 13 de noviembre de 2026 — Exportación de reportes a DOCX/ODT
· 16 de noviembre de 2026 — Generación de reportes pesados en segundo plano

Cumplimiento y gobernanza
· 21 de noviembre de 2026 — Panel de cumplimiento ISO 27001
· 28 de noviembre de 2026 — Cobertura SOC 2 y PCI DSS en el panel
· 14 de diciembre de 2026 — Inicio de preparación SOC 2 Type II (políticas)

Refinamiento y documentación
· 17 de diciembre de 2026 — Documentación técnica actualizada
· 22 de diciembre de 2026 — Videos tutoriales
· 28 de diciembre de 2026 — Revisión final de rendimiento y seguridad

Las fechas son estimaciones publicadas por transparencia. Cualquier ajuste
se anunciará en el changelog público de la plataforma.

Versión EN: espejo exacto ("Public Roadmap (estimated dates)" · "October 21, 2026 — History tables partitioning (faster queries)" · etc.).
🛠️ Diseño técnico (evita duplicar fechas y pasa los guards)
Principio: las fechas viven en un solo lugar como datos ISO; los textos viven en i18n; el formato "día mes año" lo produce Intl.DateTimeFormat según el locale. Así el guard de paridad i18n se cumple sin duplicar fechas en es.json/en.json.
ts
// src/shared/data/public-roadmap.ts  (fuente única de verdad)
export type RoadmapItem = {
  id: string;
  group: 'perf' | 'integrations' | 'compliance' | 'refinement';
  titleKey: string;          // clave i18n del texto de la mejora
  targetDate: string;        // ISO: '2026-10-21'
};

export const PUBLIC_ROADMAP: RoadmapItem[] = [
  { id: 'partitioning',  group: 'perf',         titleKey: 'disclaimer.roadmap.partitioning',  targetDate: '2026-10-21' },
  { id: 'ai-cache',      group: 'perf',         titleKey: 'disclaimer.roadmap.aiCache',       targetDate: '2026-10-24' },
  { id: 'cdn',           group: 'perf',         titleKey: 'disclaimer.roadmap.cdn',           targetDate: '2026-10-27' },
  { id: 'usage-panel',   group: 'perf',         titleKey: 'disclaimer.roadmap.usagePanel',    targetDate: '2026-11-02' },
  { id: 'osint',         group: 'integrations', titleKey: 'disclaimer.roadmap.osint',         targetDate: '2026-11-06' },
  { id: 'webhooks',      group: 'integrations', titleKey: 'disclaimer.roadmap.webhooks',      targetDate: '2026-11-11' },
  { id: 'docx',          group: 'integrations', titleKey: 'disclaimer.roadmap.docx',          targetDate: '2026-11-13' },
  { id: 'bg-jobs',       group: 'integrations', titleKey: 'disclaimer.roadmap.bgJobs',        targetDate: '2026-11-16' },
  { id: 'iso27001',      group: 'compliance',   titleKey: 'disclaimer.roadmap.iso27001',      targetDate: '2026-11-21' },
  { id: 'soc2-pci',      group: 'compliance',   titleKey: 'disclaimer.roadmap.soc2pci',       targetDate: '2026-11-28' },
  { id: 'soc2-prep',     group: 'compliance',   titleKey: 'disclaimer.roadmap.soc2prep',      targetDate: '2026-12-14' },
  { id: 'docs',          group: 'refinement',   titleKey: 'disclaimer.roadmap.docs',          targetDate: '2026-12-17' },
  { id: 'tutorials',     group: 'refinement',   titleKey: 'disclaimer.roadmap.tutorials',     targetDate: '2026-12-22' },
  { id: 'sec-review',    group: 'refinement',   titleKey: 'disclaimer.roadmap.secReview',     targetDate: '2026-12-28' },
];
// En el componente del disclaimer (barrera pre-login)
const locale = useLocale(); // 'es' | 'en'
const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });

<details>  {/* colapsable: la barrera sigue siendo usable */}
  <summary>{t('disclaimer.roadmap.title')}</summary>
  {GROUPS.map(g => (
    <section key={g.id}>
      <h3>{t(g.titleKey)}</h3>
      <ul>
        {PUBLIC_ROADMAP.filter(i => i.group === g.id).map(item => (
          <li key={item.id}>
            <time dateTime={item.targetDate}>{fmt.format(new Date(item.targetDate))}</time>
            {' — '}{t(item.titleKey)}
          </li>
        ))}
      </ul>
    </section>
  ))}
  <p className="text-muted">{t('disclaimer.roadmap.disclaimer')}</p>
</details>
Claves i18n a añadir (mismas claves en messages/es.json y messages/en.json, namespace disclaimer.roadmap.*): títulos de grupo, textos de cada mejora, título de sección y el aviso de "fechas estimadas". Sin fechas en los JSON → paridad garantizada.
🛡️ Checklist de guards que este cambio debe respetar
Guard
Cómo se cumple
i18n parity (es/en)
Mismas claves en ambos JSON; fechas fuera de los JSON
Contrast WCAG AA
Textos con tokens --fg / --muted-fg (ya AA en ambos temas)
Entrypoint único
Sin middleware nuevo: es contenido dentro de la página de disclaimer existente
Lógica de aceptación intacta
Cookie de 30 días y botón de aceptar sin cambios; la hoja de ruta es informativa
Sin secretos
Solo fechas y descripciones públicas
CSP
Sin scripts nuevos; <details>/<summary>/<time> son HTML nativo
📍 Ubicación en el cronograma
Nueva tarea 6.0 — Hoja de ruta pública en el disclaimer inicial, al inicio de la Semana 1 (20-21 de octubre de 2026), en paralelo al análisis de particionado:
Tarea
Esfuerzo
Fecha objetivo
6.0 Config public-roadmap.ts + claves i18n es/en
0.5 día
20 de octubre de 2026
6.0 Render colapsable en el disclaimer + tests de paridad
0.5 día
21 de octubre de 2026
Razón de hacerlo primero: el compromiso público debe existir antes de que empiece la ejecución, para que las fechas publicadas y el trabajo real arranquen alineados.
⚠️ Dos cautelas de producto (honradas en el texto)
"Estimadas" no es decorativo: publicar día exacto crea expectativa de día exacto. El texto incluye la cláusula de ajuste vía changelog para que mover una fecha sea un acto comunicado, no un incumplimiento silencioso.
Colapsable por usabilidad: la barrera legal no debe crecer hasta volverse ilegible; los grupos van dentro de <details> con el aviso legal y el botón de aceptación siempre visibles encima.
📄 Actualización del plan
Añado al documento IMPLEMENTATION-PLAN-2026-Q4.md la sección:
### Tarea 6.0 — Hoja de ruta pública en el disclaimer inicial (20-21 oct 2026)
- Fuente única: src/shared/data/public-roadmap.ts (fechas ISO)
- Textos: namespace disclaimer.roadmap.* en messages/es.json y messages/en.json
- Formato: Intl.DateTimeFormat(locale, { day, month: long, year }) → "21 de octubre de 2026" / "October 21, 2026"
- UI: sección colapsable dentro de la barrera pre-login; aceptación y cookie sin cambios
- Guards: i18n parity, WCAG AA, entrypoint único, CSP
- Criterio de éxito: disclaimer muestra 4 grupos y 14 mejoras con fecha día-mes-año en es y en