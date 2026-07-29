---
layout: default
title: Pipeline DNS/WHOIS (P0.2)
nav_order: 8
permalink: /docs/architecture/pipeline-history
---

# Pipeline de Historial DNS/WHOIS — Arquitectura

{: .no_toc }

<details open markdown="block">
  <summary>Table of Contents</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Visión general

El pipeline P0.2 (Historical DNS/WHOIS Tracking) proporciona **persistencia histórica** y **detección de cambios** para registros DNS y WHOIS de todos los dominios auditados. Cada vez que un executor ejecuta un escaneo, los resultados se persisten automáticamente como snapshots. Cuando un dominio se escanea múltiples veces, el sistema compara los snapshots consecutivos y detecta cambios (añadido, modificado, eliminado). Si hay cambios, se disparan alertas SIEM automáticas a todos los canales configurados.

```
Executor DNS/WHOIS
        │
        ▼
  ┌─────────────────┐
  │  processDns    │   ← Orchestrator
  │  Results()      │
  └────────┬────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
  Persist      Detect
  Snapshots    Changes
     │            │
     ▼            ▼
  dns_        DnsChange[]
  history     WhoisChange[]
     │            │
     │       ┌────┴────┐
     │       ▼         ▼
     │   logSecurity  sendDnsChange
     │   Event()      Alerts()
     │       │         │
     │       ▼         ▼
     │   security_  SIEM Webhooks
     │   audit_     (Slack/Email/
     │   logs       PD/Splunk)
     │                │
     │           ┌────┴────┐
     │           ▼         ▼
     │       persist    siem_
     │       Delivery   alert_
     │       ()         logs
     ▼
  HistoryPanel
  (IntelligenceTab UI)
```

## Motivación

### ¿Por qué persistencia histórica?

Las consultas DNS y WHOIS tradicionales son **puntuales** — te dicen el estado actual pero no cómo cambió con el tiempo. La persistencia histórica permite:

1. **Detectar cambios** — ¿Cambió el registrador del dominio? ¿Expiró el certificado SSL?
2. **Auditar proveedores** — ¿El hosting movió tu IP a otro rango? ¿Cambiaron los nameservers?
3. **Responder incidentes** — ¿Cuándo apareció este subdominio? ¿Quién registró este dominio antes?
4. **Cumplimiento** — Mantener un historial de cambios WHOIS para compliance

### ¿Por qué detección de cambios?

No todos los cambios DNS/WHOIS son benignos:

| Cambio | Riesgo |
|--------|--------|
| MX record cambiado | Posible hijacking de correo |
| NS record eliminado | Pérdida de servicio DNS |
| WHOIS registrador cambiado | Posible transferencia no autorizada |
| Fecha de expiración reducida | Dominio podría perderse |
| Nuevo subdominio con SSL | Shadow IT no autorizado |

## Arquitectura

### 1. Tipos compartidos

`src/server/intelligence/history/types.ts` define los tipos base:

```typescript
// Snapshot DNS: representa el valor de un registro en un momento dado
interface DnsSnapshot {
  recordType: string;   // "A" | "AAAA" | "MX" | "NS" | "TXT" | ...
  query: string;        // El dominio consultado
  value: string;        // El valor del registro
  ttl: number | null;   // Time to live
  metadata?: Record<string, unknown>;  // Datos adicionales
}

// Snapshot WHOIS: representa el estado WHOIS completo de un dominio
interface WhoisSnapshot {
  domain: string;
  registrar: string | null;
  createdDate: Date | null;
  expiresDate: Date | null;
  updatedDate: Date | null;
  status: string[];
  nameservers: string[];
  abuseContact: string | null;
  registrantOrg: string | null;
  originalData: Record<string, unknown>;
}

// Cambio detectado entre snapshots
interface DnsChange {
  type: 'added' | 'removed' | 'changed';
  recordType: string;
  query: string;
  previousValue: string | null;
  currentValue: string | null;
  detectedAt: Date;
}

interface WhoisChange {
  field: string;           // "registrar" | "expiresDate" | "nameservers"
  label: string;           // "Registrador" | "Fecha de Expiración"
  previousValue: string | null;
  currentValue: string | null;
  severity: 'info' | 'warning' | 'critical';
  detectedAt: Date;
}
```

### 2. Persistencia DNS

`src/server/intelligence/history/dns-history.ts`

El flujo de persistencia usa **deduplicación por hash SHA-256** para evitar snapshots duplicados:

```
persistDnsSnapshot(projectId, investigationId, recordType, query, value, ttl, metadata)
  │
  ├─ snapshotStr = `${recordType}:${query}:${value}:${ttl}`
  ├─ snapshotHash = sha256(snapshotStr).slice(0, 16)
  │
  ├─ ¿Existe un snapshot con mismo hash en los últimos 60s?
  │   ├─ Sí → return (dedup, no insert)
  │   └─ No → INSERT en dns_history
  │
  └─ catch → console.error (fail-safe)
```

**Batch insert:** `persistDnsSnapshotsBatch()` itera sobre un array de snapshots y llama `persistDnsSnapshot()` por cada uno.

### 3. Persistencia WHOIS

`src/server/intelligence/history/whois-history.ts`

La persistencia WHOIS es más compleja porque compara el snapshot completo contra el último guardado:

```
persistWhoisSnapshot(projectId, investigationId, snapshot)
  │
  ├─ snapshotStr = JSON.stringify(snapshot)
  ├─ snapshotHash = sha256(snapshotStr)
  │
  ├─ ¿Último snapshot tiene mismo hash?
  │   ├─ Sí → return { isNew: false, changes: [] }
  │   └─ No → CONTINUE
  │
  ├─ Determinar cambios comparando campos:
  │   ├─ registrar:        anterior vs nuevo  → WhoisChange { severity: 'warning' }
  │   ├─ expiresDate:      anterior vs nuevo  → WhoisChange { severity: 'critical' }
  │   ├─ nameservers:      anterior vs nuevo  → WhoisChange { severity: 'warning' }
  │   └─ registrantOrg:    anterior vs nuevo  → WhoisChange { severity: 'warning' }
  │
  ├─ INSERT nuevo snapshot
  └─ return { isNew: true, changes: [WhoisChange, ...] }
```

### 4. Detección de cambios DNS

`detectDnsChanges(projectId, query)`

```
detectDnsChanges(projectId, domain)
  │
  ├─ SELECT DISTINCT recordType FROM dns_history WHERE projectId AND query
  │
  └─ Para cada recordType:
       │
       ├─ SELECT últimos 2 snapshots ORDER BY snapshotDate DESC LIMIT 2
       │
       ├─ ¿Hay 2 snapshots con valores diferentes?
       │   ├─ Sí → DnsChange { type: 'changed', previousValue, currentValue }
       │   └─ No → CONTINUE
       │
       └─ ¿Hay 1 solo snapshot? → DnsChange { type: 'added', currentValue }
```

### 5. Orchestrador

`src/server/intelligence/history/orchestrator.ts`

Coordina persistencia + detección + alertas:

```typescript
export async function processDnsResults(params: {
  projectId: string;
  investigationId?: string;
  domain: string;
  results: {
    a?: string[];
    aaaa?: string[];
    mx?: Array<{ exchange: string; priority: number }>;
    ns?: string[];
    txt?: string[];
  };
}): Promise<{ snapshotsPersisted: number; changes: DnsChange[] }> {
  // 1. Construir array de snapshots desde los resultados
  // 2. persistDnsSnapshotsBatch() → guardar en BD
  // 3. detectDnsChanges() → comparar snapshots
  // 4. Si hay cambios → sendDnsChangeAlerts() (fire-and-forget)
  // 5. Return resultado
}
```

### 6. Alertas SIEM

Cuando se detectan cambios, se disparan alertas automáticas:

#### DNS Change Alerts

`src/server/security/dns-change-alert.ts`

| Condición | Severidad | Mensaje |
|-----------|-----------|---------|
| MX/NS eliminado | 🔴 critical | `"10 mail.example.com" → null` |
| Cualquier cambio | 🟡 warning | `"1.2.3.4" → "5.6.7.8"` |
| Registro añadido | 🔵 info | `null → "v=spf1 ..."` |

#### WHOIS Change Alerts

`src/server/security/whois-change-alert.ts`

| Condición | Severidad | Mensaje |
|-----------|-----------|---------|
| Expiración cambiada | 🔴 critical | `"2026-07-31" → "2026-09-15"` |
| Registrador cambiado | 🟡 warning | `"GoDaddy" → "Namecheap"` |
| Nameservers cambiados | 🟡 warning | `"ns1.old" → "ns1.new"` |

Ambos tipos de alerta:
1. Loguean cada cambio en `security_audit_logs`
2. Envían a todos los canales SIEM configurados (Slack, Email, PagerDuty, Splunk)
3. Persisten el delivery en `siem_alert_logs`

### 7. API Endpoint

`GET /api/intelligence/history`

```typescript
// Query params:
//   projectId (required)
//   type: "dns" | "whois" | "timeline"
//   query: string (dominio)
//   recordType: string (A, MX, etc.)
//   from: ISO date
//   to: ISO date
//   limit: number (default 50)
//   offset: number (default 0)

Response: {
  success: true,
  data: {
    dnsChanges: DnsChange[],
    whoisChanges: WhoisChange[],
    totalChanges: number,
  }
}
```

### 8. UI: HistoryPanel

`src/app/components/HistoryPanel.tsx`

Panel con 3 tabs integrado en IntelligenceTab:

```
┌─────────────────────────────────────────────────────┐
│  IntelligenceTab                                     │
│                                                      │
│  [Superficie] [Mapa] [DNS] [WHOIS] [PDF]            │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  HistoryPanel                                 │   │
│  │                                               │   │
│  │  ┌──────────┬──────────┬──────────────┐      │   │
│  │  │ 📡 DNS   │ 📖 WHOIS │ 📊 Timeline  │      │   │
│  │  ├──────────┴──────────┴──────────────┤      │   │
│  │  │ Search: [________________] [🔍]     │      │   │
│  │  │                                      │      │   │
│  │  │ [A] 181.114.200.146                 │      │   │
│  │  │ [MX] 10 mail.example.com            │      │   │
│  │  │ [NS] ns1.host.com                   │      │   │
│  │  │ ...                                 │      │   │
│  │  └──────────────────────────────────────┘      │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## Flujo completo (end-to-end)

### Escaneo DNS → Alerta SIEM

```
1. Usuario ejecuta "Escanear Infraestructura Cibernética"
2. dnsLookupExecutor se ejecuta con el dominio
3. processDnsResults() es llamado:
   ├─ 3a. persistDnsSnapshotsBatch() guarda A/AAAA/MX/NS/TXT
   ├─ 3b. detectDnsChanges() compara con último snapshot
   └─ 3c. Si hay cambios → sendDnsChangeAlerts() (fire-and-forget)
         ├─ logSecurityEvent() escribe en security_audit_logs
         ├─ buildDnsAlertPattern() construye SiemPattern
         └─ sendDnsAlerts() envía a Slack/Email/PagerDuty/Splunk
              └─ persistDelivery() guarda en siem_alert_logs
4. UI: HistoryPanel puede consultar GET /api/intelligence/history
5. UI: /security/audit → DNS Alerts tab muestra los eventos
```

### Escaneo WHOIS → Alerta SIEM

```
1. whoisFullExecutor se ejecuta (RDAP → WhoisSnapshot)
2. persistWhoisSnapshot() es llamado:
   ├─ 2a. SHA-256 dedup: snapshot nuevo vs último
   ├─ 2b. Si hay diff → detecta cambios campo por campo
   └─ 2c. Si hay cambios → sendWhoisChangeAlerts()
         ├─ logSecurityEvent()
         ├─ buildWhoisAlertPattern()
         └─ sendWhoisAlerts() → webhooks
              └─ persistDelivery() → siem_alert_logs
```

## Dashboard de Seguridad

`/security/audit` tiene 4 pestañas:

| Pestaña | Fuente | Muestra |
|---------|--------|---------|
| 🛡️ Security Events | `security_audit_logs` | Todos los eventos: rate limits, CSP violations, auth |
| 📡 SIEM Alerts | `siem_alert_logs` | Alertas enviadas: patrones detectados, heartbeat |
| 🔍 WHOIS Alerts | `siem_alert_logs` WHERE `whois_change_detected` | Changes WHOIS con diff visual (🏢📅🌐) |
| 🌐 DNS Alerts | `siem_alert_logs` WHERE `dns_change_detected` | Changes DNS con badges de record type (🌐📧🏷️📝) |

## Archivos del módulo

```
src/server/intelligence/history/
├── types.ts              # Tipos compartidos
├── dns-history.ts        # Persistencia + detección DNS
├── whois-history.ts      # Persistencia + detección WHOIS
├── orchestrator.ts       # Coordinador principal
└── pipeline-test.ts      # Test de integración

src/server/security/
├── dns-change-alert.ts   # Alertas SIEM para cambios DNS
├── whois-change-alert.ts # Alertas SIEM para cambios WHOIS
└── api-key-expiry-alert.ts # Alertas para expiración de API keys

src/app/components/
├── HistoryPanel.tsx       # UI del histórico (DNS/WHOIS/Timeline)
└── tabs/IntelligenceTab.tsx # Integración del panel

src/app/api/intelligence/history/
└── route.ts               # API endpoint

src/shared/db/schemas/
└── history.ts             # Esquemas Drizzle

drizzle/
└── 0010_dns_whois_history.sql  # Migración
```

## Verificación

Para verificar que el pipeline funciona:

```bash
npx tsx src/server/intelligence/history/pipeline-test.ts
```

Esto ejecuta el pipeline completo contra Supabase real:
1. Crea proyecto de prueba
2. Persiste 5 snapshots DNS
3. Detecta cambios en segunda ejecución
4. Verifica persistencia en `dns_history`
5. Verifica eventos en `security_audit_logs`
