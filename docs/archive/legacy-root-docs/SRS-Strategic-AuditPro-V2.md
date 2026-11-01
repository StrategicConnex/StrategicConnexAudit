> ⚠️ **[HISTÓRICO — ARCHIVADO 2026-11-01]** Especificación aspiracional de mayo-2026 (fase "Serverless-Native").
> Describía Next.js 15 + TimescaleDB (histórico) + estructura `src/modules/*` que nunca se materializó (scaffold eliminado, TD-04).
> Vigente: `docs/architecture/CURRENT-STATE.md` · Informe maestro: `docs/MASTER-REPORT-2026-11-01.md`.
> Los requisitos funcionales (FR-*) y UML se conservan como referencia de producto, **no como especificación**.

---
# SOFTWARE REQUIREMENTS SPECIFICATION (SRS) – StrategicAudit Pro

**Versión:** 2.0 (Serverless-Native)  
**Fecha:** 2026-05-06  
**Arquitectura:** Monolito Modular en Next.js 15 + Supabase + Trigger.dev  
**Despliegue:** Vercel (Edge / Serverless Functions)  
**Nivel de Documento:** Nivel 3 (IEEE 830-1998 / ISO/IEC/IEEE 29148:2018)

---

## Tabla de Contenidos

1. Introducción  
2. Visión de Sistemas y Alcance  
3. Requisitos Funcionales (FR)  
4. Requisitos No Funcionales (NFR)  
5. Modelado UML y Arquitectura (Serverless)  
6. Stack Tecnológico y Arquitectura de Sistemas  
7. Matriz de Trazabilidad  
Anexos

---

## 1. Introducción

### 1.1 Propósito

Este documento especifica los requisitos completos para **StrategicAudit Pro**, una plataforma SaaS enterprise de auditoría SEO, análisis de rendimiento, inteligencia de competencia y reporting automatizado. La arquitectura está **optimizada exclusivamente** para entornos serverless (Vercel, Supabase, Trigger.dev), eliminando cualquier dependencia de Docker, Kubernetes o infraestructura distribuida pesada.

### 1.2 Alcance del Producto

| Componente           | Descripción                                               |
| -------------------- | --------------------------------------------------------- |
| Core Engine          | Motor de auditoría técnica con crawling distribuido vía Trigger.dev |
| Analytics Hub        | Integración nativa con GSC, GA4, Bing Webmaster           |
| Performance Lab      | Medición de Core Web Vitals con datos CrUX + Lighthouse CI |
| Keyword Intelligence | Research, tracking y análisis competitivo de keywords     |
| Backlink Explorer    | Detección, análisis de autoridad y toxicidad de backlinks |
| CRO Suite            | A/B testing, heatmaps y análisis de conversión            |
| Schema Studio        | Generación y validación automática de datos estructurados |
| Report Center        | Dashboards unificados y exportación automatizada          |

### 1.3 Definiciones y Acrónimos

| Término | Definición                          |
| ------- | ----------------------------------- |
| LCP     | Largest Contentful Paint (< 2.5s)   |
| INP     | Interaction to Next Paint (< 200ms) |
| CLS     | Cumulative Layout Shift (< 0.1)     |
| CrUX    | Chrome User Experience Report       |
| CWV     | Core Web Vitals                     |
| SERP    | Search Engine Results Page          |
| DA/PA   | Domain Authority / Page Authority   |
| Trigger.dev | Plataforma serverless para jobs asíncronos y schedules |

---

## 2. Visión de Sistemas y Alcance

### 2.1 Visión del Sistema

> *“Consolidar en una única plataforma enterprise todas las capacidades de auditoría SEO, análisis de rendimiento, inteligencia competitiva y reporting que hoy requieren 10+ herramientas separadas, operando completamente sin servidor (serverless) para reducir costes operativos en un 70% y acelerar el time-to-market.”*

### 2.2 Stakeholders

| Rol                 | Interés Principal                         |
| ------------------- | ----------------------------------------- |
| SEO Managers        | Auditorías técnicas, tracking de rankings |
| Developers          | Métricas de rendimiento, Core Web Vitals  |
| Marketing Directors | Reportes ejecutivos, ROI de SEO           |
| Agency Owners       | White‑label reporting, multi‑cliente      |
| Data Analysts       | Exportación, APIs, integraciones          |

### 2.3 Alcance Funcional (In/Out)

| In‑Scope                             | Out‑of‑Scope (V2)              |
| ------------------------------------ | ------------------------------ |
| Auditoría técnica on‑page            | Gestión de contenido (CMS)     |
| Integración GSC + GA4 + Bing         | Integración con redes sociales |
| Core Web Vitals (CrUX + Lab)         | Email marketing automation     |
| Keyword research + tracking          | Gestión de PPC/Ads campaigns   |
| Backlink analysis                    | Community management           |
| A/B testing básico                   | CRM nativo                     |
| Schema markup                        | AI content generation          |
| Dashboards + Looker Studio connector |                                |

---

## 3. Requisitos Funcionales (FR)

### 3.1 Módulo: Performance & Core Web Vitals

#### FR-PERF-001: Medición de CWV con datos CrUX
**Prioridad:** Alta  
**Descripción:** Consultar la API de Chrome UX Report para obtener LCP, INP, CLS reales por URL/origen.  
**Criterios de aceptación:** Manejar errores 404, cachear resultados 24h, comparativa vs competidores.

#### FR-PERF-002: Auditoría Lighthouse Programática
**Prioridad:** Alta  
**Descripción:** Ejecutar Lighthouse CI en URLs con configuración personalizable (mobile/desktop, categorías).  
**Criterios:** Timeout 60s, soporte autenticación básica, historial de scores. Se ejecuta como job en Trigger.dev.

#### FR-PERF-003: Análisis de Carga por Geolocalización
**Prioridad:** Media  
**Descripción:** Medir TTFB, FCP, LCP desde múltiples ubicaciones globales usando Edge Functions de Vercel.  
**Criterios:** Mínimo 5 regiones, simulación de conexión 4G.

#### FR-PERF-004: Seguimiento Histórico de Velocidad
**Prioridad:** Media  
**Descripción:** Almacenar y visualizar evolución temporal de métricas de rendimiento en TimescaleDB.  
**Criterios:** Retención 12 meses, alertas si empeora >20%.

### 3.2 Módulo: Auditoría Técnica SEO

#### FR-AUDIT-001: Crawl Completo de Sitios
**Prioridad:** Alta  
**Descripción:** Rastrear todo el sitio extrayendo metadatos, enlaces y detectando errores.  
**Criterios:** Capacidad 100k URLs, velocidad controlada (20 URLs/segundo para respetar servidores), exportación CSV/XLSX/PDF. El crawl se ejecuta como job recursivo en Trigger.dev.

#### FR-AUDIT-002: Visualización de Arquitectura
**Prioridad:** Media  
**Descripción:** Generar mapa visual de la arquitectura de enlaces internos (grafo interactivo).  
**Criterios:** Filtrar por profundidad, exportar como PNG/SVG.

#### FR-AUDIT-003: Detección de Errores Técnicos
**Prioridad:** Alta  
**Descripción:** Identificar y clasificar problemas SEO (severidad: crítica, warning, info).  
**Criterios:** Mínimo 100 reglas predefinidas, personalización por proyecto.

### 3.3 Módulo: Integraciones de Datos

#### FR-INT-001: Google Search Console API
**Prioridad:** Alta  
**Descripción:** Sincronizar datos de GSC (clics, impresiones, CTR, posición). OAuth2 gestionado por Supabase.  
**Criterios:** Sincronización diaria automática vía Trigger.dev schedule, retención 16 meses.

#### FR-INT-002: Google Analytics 4 API
**Prioridad:** Alta  
**Descripción:** Extraer métricas de engagement, conversiones y usuarios.  
**Criterios:** Soporte dimensiones/metrics personalizados, funnels configurables.

#### FR-INT-003: Bing Webmaster Tools API
**Prioridad:** Media  
**Descripción:** Datos de indexación y rendimiento de Bing.

### 3.4 Módulo: Keyword Intelligence

#### FR-KW-001: Keyword Research
**Prioridad:** Alta  
**Descripción:** Descubrir keywords por volumen, dificultad, intención, tendencia.  
**Criterios:** Base de datos >5B keywords (API externa), actualización mensual.

#### FR-KW-002: Rank Tracking
**Prioridad:** Alta  
**Descripción:** Monitorear posiciones en SERP para keywords objetivo.  
**Criterios:** Frecuencia diaria vía Trigger.dev schedule, precisión top 100, mínimo 10k keywords por proyecto.

#### FR-KW-003: Content Gap Analysis
**Prioridad:** Media  
**Descripción:** Identificar keywords rankeadas por competidores pero no por el cliente. Se apoya en Gemini AI.

### 3.5 Módulo: Backlink Analysis

#### FR-BL-001: Backlink Discovery
**Prioridad:** Alta  
**Descripción:** Detectar todos los backlinks apuntando a un dominio.  
**Criterios:** Base de datos >30B enlaces (API externa), actualización semanal vía job.

#### FR-BL-002: Domain Authority / Page Authority
**Prioridad:** Media  
**Descripción:** Calcular métricas de autoridad propietarias (score 1‑100) usando modelo interno.

#### FR-BL-003: Toxic Link Detection
**Prioridad:** Media  
**Descripción:** Identificar backlinks dañinos y generar archivo disavow.txt.

### 3.6 Módulo: CRO & Experimentación

#### FR-CRO-001: A/B Testing
**Prioridad:** Media  
**Descripción:** Crear y ejecutar tests A/B con división de tráfico y significancia estadística.

#### FR-CRO-002: Heatmaps & Session Recordings
**Prioridad:** Media  
**Descripción:** Visualizar interacciones (clics, scrolls) mediante script liviano.

### 3.7 Módulo: Schema Markup

#### FR-SCHEMA-001: Validación de Schema
**Prioridad:** Media  
**Descripción:** Validar JSON‑LD contra Schema.org y Rich Results Test.

#### FR-SCHEMA-002: Generación Automática
**Prioridad:** Media  
**Descripción:** Generar JSON‑LD para schemas comunes (Organization, Product, FAQ, etc.).

### 3.8 Módulo: Reporting & Dashboards

#### FR-REP-001: Dashboards Unificados
**Prioridad:** Alta  
**Descripción:** Dashboards personalizables con widgets drag‑and‑drop desde cualquier módulo.

#### FR-REP-002: Looker Studio Connector
**Prioridad:** Media  
**Descripción:** Conector nativo para Google Looker Studio.

#### FR-REP-003: Exportación Automatizada
**Prioridad:** Media  
**Descripción:** Exportación programada a Google Sheets, Excel, PDF, email mediante Trigger.dev.

---

## 4. Requisitos No Funcionales (NFR)

| ID            | Requisito                                           | Métrica / Condición             |
| ------------- | --------------------------------------------------- | ------------------------------- |
| NFR-PERF-001  | Tiempo de respuesta API < 200ms (cacheadas)         | P95 < 200ms (Edge Network)      |
| NFR-PERF-002  | Tiempo de respuesta API < 2s (consultas en vivo)    | P95 < 2s                        |
| NFR-PERF-003  | Dashboard carga inicial < 3s                        | Lighthouse Performance > 90     |
| NFR-PERF-004  | Crawl de 10,000 URLs < 10 minutos                   | Respetando límites de rate      |
| NFR-PERF-005  | Soporte para 1,000 usuarios concurrentes            | Escalado automático por Vercel  |
| NFR-SCAL-001  | Escalado horizontal sin intervención                | Serverless nativo               |
| NFR-SEC-001   | OAuth2 + JWT (Supabase Auth)                        |                               |
| NFR-SEC-002   | Cifrado AES‑256 para datos sensibles en reposo      | (Supabase Vault)                |
| NFR-SEC-003   | Rate limiting: 100 req/min (free), 10k (enterprise) | Middleware de Next.js           |
| NFR-AVA-001   | SLA 99.9% uptime                                    | Garantizado por Vercel+Supabase |
| NFR-UX-001    | Diseño responsive (mobile‑first)                    | Breakpoints 320/768/1024/1440px |
| NFR-MAINT-001 | Cobertura de tests > 80% (unit + integration)       |                               |
| NFR-MAINT-002 | Documentación API OpenAPI 3.0 (auto-generada)       |                               |
| NFR-AI-001    | Toda la arquitectura debe ser legible por IA        | Estructura modular, tipos fuertes |

---

## 5. Modelado UML y Arquitectura (Serverless)

### 5.1 Diagrama de Casos de Uso (Resumen)

```plaintext
┌─────────────────────────────────────────────────────────────────┐
│                     StrategicAudit Pro                           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Usuario   │    │   Cliente   │    │   Admin     │         │
│  │   SEO       │    │   (Agency)  │    │   Sistema   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                │
│         ├──────┐    ┌──────┴──────┐           │                │
│         │      ▼    ▼             ▼           │                │
│         │  ┌─────────────┐  ┌─────────────┐    │                │
│         │  │ Configurar  │  │ Gestionar   │    │                │
│         │  │ Proyecto    │  │ Usuarios    │    │                │
│         │  └─────────────┘  └─────────────┘    │                │
│         │  ┌─────────────────────────────────────┐               │
│         │  │         MÓDULO AUDIT               │               │
│         │  │  ┌─────────┐  ┌─────────┐          │               │
│         │  │  │ Crawl   │  │Analizar │          │               │
│         │  │  │ Sitio   │  │CWV      │          │               │
│         │  │  └─────────┘  └─────────┘          │               │
│         │  │  ┌─────────┐  ┌─────────┐          │               │
│         │  │  │ Validar │  │Generar  │          │               │
│         │  │  │ Schema  │  │Reporte  │          │               │
│         │  │  └─────────┘  └─────────┘          │               │
│         │  └─────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
5.2 Diagrama de Clases (Modelo de dominio principal)
typescript
// Domain Entities
class User {
  id: UUID
  email: string
  role: Role
  authenticate(): JWT
  createProject(): Project
}

class Project {
  id: UUID
  domain: URL
  owner: User
  audits: Audit[]
  runAudit(): Promise<Audit>
}

class Audit {
  id: UUID
  type: AuditType
  status: Status
  execute(): Promise<void>
}

class Issue {
  severity: Severity
  category: Category
  recommendation: string
}
5.3 Diagrama de Secuencia – Flujo de Auditoría (Serverless)
plaintext
┌─────┐     ┌─────────┐     ┌─────────────┐     ┌───────────┐     ┌─────────┐
│User │     │Frontend │     │Next.js      │     │Trigger.dev│     │Supabase │
│     │     │(React)  │     │Route Handler│     │  Job      │     │(DB)     │
└──┬──┘     └────┬────┘     └──────┬──────┘     └─────┬─────┘     └────┬────┘
   │ 1. POST /api/audit             │                  │               │
   │─────────────>│                 │                  │               │
   │              │ 2. Server Action│                  │               │
   │              │─────────────>│                  │               │
   │              │                 │ 3. INSERT audit │               │
   │              │                 │─────────────────────────────>│
   │              │                 │ 4. trigger job  │               │
   │              │                 │────────────────>│               │
   │              │ 5. Job ID       │                  │               │
   │              │<────────────────│                  │               │
   │ 6. Polling / Realtime          │                  │               │
   │<─────────────│                 │                  │               │
   │              │                 │                  │ 7. Crawl      │
   │              │                 │                  │──┐            │
   │              │                 │                  │  │ HTTP GET   │
   │              │                 │                  │<─┘            │
   │              │                 │                  │ 8. Save results│
   │              │                 │                  │─────────────>│
   │              │                 │ 9. WebSocket     │               │
   │              │<────────────────│ (Realtime)       │               │
   │ 10. Resultados│                 │                  │               │
   │<─────────────│                 │                  │               │
5.4 Diagrama de Componentes (Serverless)
plaintext
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel Platform                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     Next.js 15 App                             │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │  App Router  │  │ Server Actions│  │Route Handlers│        │   │
│  │  │  (Pages)     │  │ (Mutaciones)  │  │  (API)       │        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  │  ┌────────────────────────────────────────────────────────┐   │   │
│  │  │               Módulos de Negocio (DDD)                  │   │   │
│  │  │  audit/ performance/ keywords/ backlinks/ reporting     │   │   │
│  │  └────────────────────────────────────────────────────────┘   │   │
│  │  ┌──────────────┐  ┌──────────────┐                           │   │
│  │  │  Drizzle ORM │  │  Supabase    │                           │   │
│  │  │  (Type-safe) │  │  Client      │                           │   │
│  │  └──────────────┘  └──────────────┘                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Trigger.dev (Jobs asíncronos)  │  Supabase (PostgreSQL + Storage)  │
└─────────────────────────────────────────────────────────────────────┘
5.5 Diagrama de Despliegue (Vercel + Supabase)
plaintext
┌──────────────────────────────────────────┐
│            Vercel Edge Network            │
│  ┌────────────────────────────────────┐   │
│  │  Edge Middleware (auth, rate limit)│   │
│  └──────────────┬─────────────────────┘   │
│                 │                          │
│  ┌──────────────▼─────────────────────┐   │
│  │  Serverless Functions (API routes) │   │
│  │  - /api/...                        │   │
│  │  - Server Actions                  │   │
│  └──────────────┬─────────────────────┘   │
│                 │                          │
│  ┌──────────────▼─────────────────────┐   │
│  │  Edge Functions (geolocation)      │   │
│  │  - Rendimiento por región          │   │
│  └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
                 │
                 │ HTTPS
                 ▼
┌──────────────────────────────────────────┐
│            Supabase Platform              │
│  ┌────────────────────────────────────┐   │
│  │  PostgreSQL 16 + TimescaleDB       │   │
│  │  (RLS, particionado, full-text)    │   │
│  └────────────────────────────────────┘   │
│  ┌────────────────────────────────────┐   │
│  │  Auth (OAuth2, JWT)                │   │
│  └────────────────────────────────────┘   │
│  ┌────────────────────────────────────┐   │
│  │  Storage (Reportes, screenshots)   │   │
│  └────────────────────────────────────┘   │
└──────────────────────────────────────────┘
5.6 Diagrama Entidad‑Relación (ER) – Extracto
Mismo modelo que en la especificación original (PostgreSQL), pero implementado con Drizzle ORM. No se muestran cambios estructurales.

6. Stack Tecnológico y Arquitectura de Sistemas
6.1 Stack Completo (Serverless-Native)
Capa	Tecnología	Versión	Justificación
Frontend	Next.js + React	15.x/19.x	App Router, Server Components, despliegue en Vercel
UI	Tailwind CSS + shadcn/ui	3.4	Utility-first, componentes accesibles
Estado	TanStack Query	5.x	Caché de servidor, sincronización
Backend API	Next.js Route Handlers	-	Unifica frontend y backend, sin servidor adicional
ORM	Drizzle ORM	0.35	Tipado fuerte, migraciones simples, excelente con Supabase
Base de datos	Supabase (PostgreSQL)	16	Multi-tenant, RLS, realtime, TimescaleDB integrado
Auth	Supabase Auth	-	OAuth2, JWT, gestión de usuarios
Jobs/Schedules	Trigger.dev	3.x	Serverless, integración nativa con Next.js, sin Redis
Almacenamiento	Supabase Storage	-	Objetos, imágenes, reportes
Búsqueda	PostgreSQL Full-Text Search	-	Suficiente para millones de URLs, evita Elasticsearch
Monitoreo	Vercel Analytics + Sentry	-	Zero-config, observabilidad integrada
Testing	Vitest + Playwright	1.x/1.40	Unitario, integración, e2e
AI Integración	Google Gemini (Vercel AI)	-	Recomendaciones, content gap, resúmenes inteligentes
6.2 Patrones de Diseño (Simplificados)
Modular Monolith – Todo el código en una aplicación Next.js, con separación de módulos por dominio.

Clean Architecture – Cada módulo tiene capas: dominio, aplicación, infraestructura, presentación.

CQRS (light) – Separación de queries (Server Components) y commands (Server Actions / Route Handlers).

Event-driven (local) – Mediante Trigger.dev jobs y webhooks.

Repository Pattern – Abstracción de la base de datos con Drizzle.

Row Level Security – Aislamiento multi-tenant a nivel de base de datos (Supabase RLS).

6.3 Estructura de Carpetas Enterprise (Descripción)
text
strategicaudit-pro/
├── apps/web/                     # Monolito Next.js
│   ├── src/app/                  # App Router (páginas, layouts, API)
│   ├── src/modules/              # Módulos de negocio (DDD)
│   │   ├── audit/
│   │   ├── performance/
│   │   ├── keywords/
│   │   └── ...
│   ├── src/shared/               # Código compartido (db, lib, types)
│   ├── trigger/                  # Jobs de Trigger.dev
│   ├── drizzle/                  # Migraciones Drizzle
│   └── tests/
├── packages/ui/                  # Componentes UI compartidos
├── supabase/migrations/          # Migraciones SQL (RLS, funciones)
└── .github/workflows/            # CI/CD (tests, despliegue)
7. Matriz de Trazabilidad
Requisito	Módulo	Componente Serverless	Test
FR-PERF-001	performance	Server Action + Trigger.dev job (CrUX)	T-PERF-001
FR-PERF-002	performance	Trigger.dev job (Lighthouse CI)	T-PERF-002
FR-AUDIT-001	audit	Trigger.dev job (recursive crawl)	T-AUDIT-001
FR-INT-001	integrations	Trigger.dev schedule + Google API client	T-INT-001
FR-KW-001	keywords	Server Component + External API	T-KW-001
FR-BL-001	backlinks	Trigger.dev schedule + Backlink API	T-BL-001
FR-REP-001	reporting	Server Component + Realtime subscription	T-REP-001
NFR-PERF-001	infra	Edge Middleware + CDN caching	T-NFR-001
NFR-SEC-001	auth	Supabase Auth + RLS	T-SEC-001
Anexos
A. APIs Externas Requeridas
Google Search Console API v3

Google Analytics Data API (GA4) v1

Google PageSpeed Insights API v5

Bing Webmaster Tools API

Chrome UX Report API (BigQuery / REST)

(Opcional) API de proveedor de backlinks (Ahrefs, Semrush, o Moz)

B. Glosario de Métricas SEO
CTR: Click‑Through Rate

CR: Conversion Rate

DA/PA: Domain Authority / Page Authority

TF/CF: Trust Flow / Citation Flow

C. Política de Migración desde Arquitectura Legacy
No aplica – el proyecto se construye directamente con la arquitectura serverless descrita.

Aprobaciones
Rol	Nombre	Fecha	Firma
Product Owner	(por definir)	2026-05-06	
Arquitecto Software	(por definir)	2026-05-06	
Lead Developer	(por definir)	2026-05-06	
Fin del documento – Aprobado para fase de desarrollo AI‑first.