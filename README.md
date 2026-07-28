<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/StrategicConnex/StrategicConnexAudit/main/public/logo-dark.svg">
    <img alt="SCAUDIT Pro" src="https://raw.githubusercontent.com/StrategicConnex/StrategicConnexAudit/main/public/logo.svg" width="180" height="auto">
  </picture>
</p>

<h1 align="center">StrategicAudit Pro (SCAUDIT)</h1>

<p align="center">
  <strong>Enterprise Cyber Intelligence & Technical Auditing Platform</strong>
</p>

<p align="center">
  <a href="https://scaudit.vercel.app"><img src="https://img.shields.io/badge/scaudit.vercel.app-Live-6366f1?style=flat-square&logo=vercel" alt="Live"></a>
  <a href="https://github.com/StrategicConnex/StrategicConnexAudit/actions"><img src="https://github.com/strategicconnex/strategicaudit-pro/actions/workflows/ci.yml/badge.svg?style=flat-square" alt="CI"></a>
  <a href="https://codecov.io/gh/strategicconnex/strategicaudit-pro"><img src="https://codecov.io/gh/strategicconnex/strategicaudit-pro/branch/main/graph/badge.svg?style=flat-square" alt="Coverage"></a>
  <img src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" alt="Next.js 16">
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License">
</p>

---

StrategicAudit Pro (SCAUDIT) es una plataforma **enterprise-grade** de inteligencia de red, monitoreo de superficie de ataque, auditoría técnica SEO y ciberseguridad continua. Diseñada para equipos de seguridad, analistas de threat intelligence y consultores técnicos que necesitan visibilidad profunda de su infraestructura digital.

> **Sitio en vivo:** [scaudit.vercel.app](https://scaudit.vercel.app)

---

## Tabla de contenidos

- [Capacidades clave](#-capacidades-clave)
- [Arquitectura](#️-arquitectura)
- [Stack tecnológico](#-stack-tecnológico)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Instalación](#-instalación)
- [Configuración](#-configuración)
- [Scripts](#-scripts)
- [Design System](#-design-system)
- [Seguridad](#-seguridad)
- [Pruebas](#-pruebas)
- [API & Endpoints](#-api--endpoints)
- [Deploy](#-deploy)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

---

## 🚀 Capacidades clave

### 🖥️ Dashboard de Proyectos
- **Gestión multi-proyecto** con cards de estado visuales (health score, última auditoría, integraciones)
- **Monitoreo en vivo** con heartbeat pulse, latencia y uptime de cada proyecto
- **Auditorías técnicas** con crawler SEO profundo (títulos, metadatos, H1/H2, estructura de contenido)
- **Integraciones**: Google Search Console (GSC), Google Analytics 4 (GA4), Bing Webmaster Tools
- **Métricas de rendimiento**: Core Web Vitals (LCP, INP, CLS, TTFB, FCP), Lighthouse scores
- **Keywords**: seguimiento de posiciones, volumen de búsqueda, CPC, competencia
- **Exportación**: Reportes PDF y CSV

### 🔍 Inteligencia Cibernética
- **Escaneo de infraestructura**: DNS (lookup, MX, TXT, NS, SOA, CNAME, DMARC, SPF), WHOIS, GeoIP
- **Monitoreo de superficie de ataque**: descubrimiento de subdominios, IPs, puertos abiertos
- **Ejecutores de red**: ping, traceroute, HTTP headers, SSL/TLS certificate inspection
- **OSINT**: shodan queries, email breach detection, reverse DNS
- **Análisis de drift**: detección de cambios en la postura de seguridad a lo largo del tiempo
- **Risk Engine**: scoring de vulnerabilidades con severidad y confianza
- **Tool Registry**: 25+ herramientas de inteligencia disponibles con rate limiting y caching
- **Protección SSRF**: `egress-guard` con validación CIDR matemática IPv4/IPv6

### 🤖 AI Copilot & Reportes
- **Copilot de Infraestructura**: asistente IA para planes de remediación técnica
- **Incident Brief**: generación automática de resúmenes ejecutivos de seguridad
- **Reportes SEO**: análisis generativo con datos de GSC/GA4
- **Modelos gratuitos**: OpenRouter free pool (Gemini Flash, DeepSeek, Llama 4, Mistral, Qwen)
- **Fallback automático**: encadenamiento de 5 modelos con circuit breaker
- **Health Check**: monitoreo periódico de disponibilidad de modelos + dashboard

### 🛡️ Seguridad & SIEM
- **CSP dinámico**: Content-Security-Policy con nonce por request (Next.js 16 proxy)
- **Rate limiting**: `withRateLimit` decorator genérico con Upstash Redis (por IP o user)
- **Audit logging**: eventos estructurados en `security_audit_logs` con persistencia en Supabase
- **SIEM Exporter**: detección de patrones sospechosos (open redirect attacks, rate limit bypass, CSP spikes)
  - Alertas a Slack, PagerDuty y Splunk
  - Heartbeat cada 30 min para verificar pipeline
  - Push notifications al navegador
- **Egress Guard**: protección SSRF con validación CIDR matemática
- **Validación de email**: anti-spam, anti-desechables, anti-typosquatting
- **Middleware de seguridad**: HSTS, X-Frame-Options, X-Content-Type-Options, Permissions-Policy

### 📊 Monitoreo & Telemetría
- **Real User Monitoring (RUM)**: Web Vitals desde el navegador del usuario
- **Uptime monitoring**: checks periódicos con Vercel Cron + Trigger.dev
- **Alertas de drift**: detección de cambios en infraestructura
- **AI Health Dashboard**: gráficos de salud por modelo, latencia promedio diaria, eventos de fallo

### 🔐 Autenticación
- **Magic Link**: login sin contraseña via Supabase Auth
- **Validación de email en tiempo real**: detecta correos desechables, temporales, typosquatting
- **Rate limiting por IP**: 20 intentos/min en validate-email, 10 intentos/min en callback
- **Protección anti-open-redirect**: validación estricta del parámetro `next`

---

## 🏗️ Arquitectura

```
                          ┌─────────────────────┐
                          │    Vercel Edge       │
                          │   (proxy.ts)         │
                          │  CSP · HSTS · Auth   │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
              ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
              │ Next.js    │   │ API Routes │   │ Server    │
              │ App Router │   │  (40+      │   │ Actions   │
              │ (pages)    │   │  endpoints)│   │ (auth'd)  │
              └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
                    │                │                │
              ┌─────▼───────────────▼────────────────▼─────┐
              │              Supabase (Postgres)            │
              │     · RLS (Row Level Security)              │
              │     · Auth (Magic Link)                     │
              │     · 30+ tablas (proyectos, auditorías,    │
              │       inteligencia, monitoreo, seguridad)   │
              └──────────────────┬─────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              ┌─────▼─────┐           ┌───────▼──────┐
              │  Upstash   │           │   Trigger.dev │
              │  Redis     │           │  (background  │
              │  (ratelimit│           │   jobs)       │
              │   + cache) │           │               │
              └───────────┘           └───────────────┘
                    │                         │
              ┌─────▼─────────────────────────▼──────┐
              │         OpenRouter AI (free pool)     │
              │  · Gemini Flash · DeepSeek · Llama 4  │
              │  · Mistral · Qwen · Nemotron          │
              └──────────────────────────────────────┘
```

### Decisiones arquitectónicas clave

| Decisión | Justificación |
|----------|---------------|
| **Next.js 16 App Router** | Server Components, streaming, React 19, Turbopack |
| **Proxy en vez de Middleware** | Next.js 16 deprecó `middleware.ts` — `proxy.ts` es el nuevo estándar |
| **Supabase + Drizzle ORM** | RLS nativo + type safety + migraciones SQL |
| **Upstash Redis** | Rate limiting serverless (no requiere conexión persistente) |
| **Trigger.dev** | Background jobs con retry automático (auditorías, SIEM, uptime) |
| **OpenRouter free pool** | Sin costo — 50 req/día gratis, 1000 req/día con $10+ de por vida |

---

## 🛠️ Stack tecnológico

### Frontend
- **Framework**: Next.js 16.2.4 (App Router, Turbopack)
- **Lenguaje**: TypeScript 5
- **UI**: Tailwind CSS v4 + OKLCH tokens
- **Fonts**: DM Sans (display), Inter (body), JetBrains Mono (code)
- **Gráficos**: Recharts, React Flow
- **3D**: Three.js / React Three Fiber
- **Estado**: Zustand, TanStack React Query
- **Iconos**: Lucide React

### Backend & Database
- **ORM**: Drizzle ORM 0.45
- **Database**: PostgreSQL (Supabase)
- **Auth**: Supabase Auth (Magic Link)
- **Cache**: Upstash Redis
- **Background Jobs**: Trigger.dev 4.4
- **AI**: OpenRouter API (free models)

### Infraestructura
- **Hosting**: Vercel (Standalone output)
- **CI/CD**: GitHub Actions + Playwright + Vitest
- **Coverage**: Codecov
- **Push Notifications**: Web Push API (VAPID)

---

## 📁 Estructura del proyecto

```
src/
├── app/                          # Next.js App Router
│   ├── actions/                  # Server Actions (auth'd)
│   │   ├── audits.ts             #   Crear/ejecutar auditorías
│   │   ├── projects.ts           #   CRUD de proyectos
│   │   └── reports.ts            #   Generar reportes
│   ├── ai/                       # AI Health Dashboard
│   ├── api/                      # API Routes (40+ endpoints)
│   │   ├── ai/                   #   Copilot, reportes, healthcheck
│   │   ├── auth/                 #   Validate email, callback
│   │   ├── cron/                 #   SIEM exporter, uptime
│   │   ├── intelligence/         #   Investigaciones, tools, health
│   │   ├── monitoring/           #   Monitoreo y alertas
│   │   ├── notifications/        #   Push subscriptions
│   │   └── security/             #   Audit logs, SIEM, CSP reports
│   ├── components/               # UI Components (Dashboard)
│   │   ├── tabs/                 #   Overview, Intelligence, Reports, etc.
│   │   ├── DashboardContainer.tsx
│   │   ├── DashboardSidebar.tsx
│   │   ├── ScoreGauge.tsx
│   │   ├── AttackSurfaceGraph.tsx
│   │   └── ...
│   ├── intelligence/             # Intelligence page/layout
│   ├── login/                    # Login con Magic Link
│   ├── projects/                 # Project detail + audit pages
│   └── security/                 # Security audit dashboard
│
├── components/                   # Componentes reutilizables
│   └── PushSubscribeButton.tsx   #   Push notification suscripción
│
├── features/                     # Feature modules
│   └── intelligence/             #   Intelligence Shell, Tool Catalog
│
├── lib/                          # Librerías
│   └── email-validation.ts       #   Validación anti-spam/desechables
│
├── server/                       # Server-only logic
│   ├── ai/                       #   AI Router (model pool, fallback)
│   ├── db/                       #   DB test utilities
│   ├── intelligence/             #   Core engine
│   │   ├── core/                 #     Dispatcher, cache, circuit-breaker
│   │   ├── executors/            #     DNS, network, email, OSINT, website
│   │   ├── security/             #     Egress guard (SSRF)
│   │   └── registry/             #     Tool registry
│   ├── notifications/            #   Push notification service
│   └── security/                 #   SIEM exporter, audit
│
├── shared/                       # Shared across app
│   ├── config/                   #   Env validation
│   ├── db/                       #   Drizzle schemas (30+ tablas)
│   │   └── schemas/              #     health, intelligence, monitoring,
│   │                             #     security-audit, push-subscriptions
│   ├── lib/                      #   Auth, ratelimit, audit-log, logger
│   └── utils/                    #   Network, PDF export
│
├── proxy.ts                      # Next.js 16 proxy (replaces middleware)
└── trigger/                      # Trigger.dev background tasks
    ├── audit.trigger.ts          #   Auditorías programadas
    ├── monitoring.trigger.ts     #   Monitoreo de infraestructura
    ├── siem.trigger.ts           #   SIEM exporter (cada 5 min)
    ├── uptime.trigger.ts         #   Uptime checks
    └── webhook.trigger.ts        #   Webhook delivery
```

---

## 💻 Instalación

### Requisitos

- Node.js >= 20
- pnpm >= 9
- Una cuenta de [Supabase](https://supabase.com) (gratuita)
- Una cuenta de [Upstash](https://upstash.com) (gratuita, para Redis)
- Una cuenta de [OpenRouter](https://openrouter.ai/keys) (gratuita, sin tarjeta)

### Pasos

```bash
# 1. Clonar el repositorio
git clone https://github.com/StrategicConnex/StrategicConnexAudit.git
cd StrategicConnexAudit

# 2. Instalar dependencias
pnpm install

# 3. Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales (ver sección Configuración)

# 4. Ejecutar migraciones de base de datos
pnpm db:push

# 5. Iniciar servidor de desarrollo
pnpm dev
# Abrir http://localhost:3000
```

---

## ⚙️ Configuración

### Variables de entorno

```env
# ─── Supabase (obligatorio) ─────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...    # Para bypass de RLS en server
DIRECT_URL=postgresql://...         # URL directa para migraciones

# ─── Upstash Redis (obligatorio para rate limiting) ─────────────
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# ─── OpenRouter (opcional — AI Copilot, Reportes) ───────────────
OPENROUTER_API_KEY=sk-or-v1-...    # https://openrouter.ai/keys

# ─── SIEM Webhooks (opcional) ───────────────────────────────────
SIEM_WEBHOOK_SLACK=https://hooks.slack.com/services/...
SIEM_WEBHOOK_PAGERDUTY=https://events.pagerduty.com/v2/...
SIEM_WEBHOOK_SPLUNK=https://http-inputs-mysplunk.splunkcloud.com/...
SIEM_PAGERDUTY_ROUTING_KEY=xxx

# ─── Push Notifications (opcional) ──────────────────────────────
VAPID_PUBLIC_KEY=xxx               # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=xxx

# ─── Desarrollo (opcional) ──────────────────────────────────────
NEXT_PUBLIC_DEV_BYPASS_AUTH=true   # Saltea auth en dev
CRON_SECRET=xxx                    # Para endpoints de cron
```

### Base de datos

El proyecto usa Drizzle ORM con migraciones SQL. Para sincronizar:

```bash
pnpm db:generate   # Generar migración desde schemas
pnpm db:push       # Aplicar migraciones a Supabase
```

Las migraciones se almacenan en `drizzle/` (9 migrations hasta la fecha).

---

## 📜 Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm dev` | Iniciar servidor de desarrollo (Turbopack) |
| `pnpm build` | Build de producción |
| `pnpm start` | Iniciar servidor de producción |
| `pnpm lint` | Ejecutar ESLint |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm test:coverage` | Tests con reporte de cobertura |
| `pnpm test:e2e` | Tests E2E con Playwright |
| `pnpm db:generate` | Generar migración Drizzle |
| `pnpm db:push` | Aplicar migraciones a la BD |
| `pnpm setup-admin` | Crear usuario administrador |

---

## 🎨 Design System

SCAUDIT Pro usa un **design system propietario** definido en OKLCH, inspirado en instrumentos de precisión forense y consolas de monitoreo SOC.

### Paleta de color

| Token | OKLCH | Uso |
|-------|-------|-----|
| `bg-background` | `oklch(1.8% 0.003 265)` | Fondo near-black |
| `text-foreground` | `oklch(93% 0.008 265)` | Texto principal |
| `bg-card` | `oklch(3% 0.006 265)` | Cards |
| `text-primary` | `oklch(68% 0.14 230)` | Índigo — acciones, links |
| `text-chartreuse` | `oklch(78% 0.18 140)` | Señal viva, indicadores OK |
| `text-destructive` | `oklch(55% 0.22 25)` | Errores, severidad crítica |
| `border-border` | `oklch(15% 0.008 265)` | Bordes de cards |
| `text-muted-fg` | `oklch(35% 0.02 260)` | Texto secundario |

### Tipografía

| Rol | Fuente | Pesos |
|-----|--------|-------|
| Display | DM Sans | 400–1000 |
| Body | Inter | 400–800 |
| Mono | JetBrains Mono | 400–600 |

### Glass utilities

- `glass-panel`: Panel translúcido para sidebars/headers
- `glass-card`: Card estándar con gradiente sutil
- `glass-card-hero`: Card destacada con glow primario

### Animaciones globales

`scan-pulse`, `pulse-beat`, `fade-in`, `slide-in-right`, `scale-check`, `message-in`, `shimmer`

> **Ver documentación completa:** [`SCAUDIT-THEME.md`](./SCAUDIT-THEME.md)

---

## 🛡️ Seguridad

### Content Security Policy (CSP)
- Aplicada dinámicamente por proxy.ts con nonce por request
- `strict-dynamic` para scripts (excepto en dev con `unsafe-eval`)
- Report endpoint: `/api/security/csp-report`
- Meta tag CSP defense-in-depth para páginas prerendered

### Rate Limiting
- **Decorate generico**: `withRateLimit(config, handler)` envuelve cualquier route handler
- **Identificación por IP**: extracción jerárquica (x-vercel-forwarded-for → x-real-ip → x-forwarded-for)
- **Fail closed** en producción si Redis no está disponible
- **Audit logging**: cada rate limit hit se registra en `security_audit_logs`

### Protección SSRF
- `egress-guard.ts`: validación CIDR matemática para IPv4 e IPv6
- 16 rangos privados IPv4 + 7 rangos IPv6 bloqueados
- `assertPublicHostname()`: verifica resolución DNS contra IPs privadas
- `safeFetch()`: wrapper de fetch con timeout, redirect manual y validación de destino

### SIEM (Security Information & Event Management)
- **Exportador** que corre cada 5 min via Vercel Cron
- **7 reglas de detección**: open redirect attacks, rate limit bypass, AI model failure, CSP spikes, auth failure bursts
- **3 canales de alerta**: Slack, PagerDuty, Splunk
- **Heartbeat** cada 30 min para verificar pipeline
- **Dashboard** en `/security/audit` con filtros por tipo, IP y fecha

### Autenticación
- Magic Link sin contraseña
- Validación de email anti-spam/anti-desechables (400+ dominios bloqueados)
- Protección anti-open-redirect en callback
- Rate limiting dedicado por endpoint

---

## 🧪 Pruebas

### Unitarias (Vitest)

```bash
pnpm test              # Ejecutar todas las pruebas
pnpm test:coverage     # Con reporte de cobertura
```

**Cobertura actual:** 25%+ líneas, 20%+ branches (umbrales de CI)

| Archivo | Cobertura |
|---------|-----------|
| `ratelimit.ts` | ✅ Probado (rate limiting + IP extraction) |
| `siem-exporter.ts` | ✅ Probado (pattern detection + webhooks) |
| `network.ts` | ✅ Probado (utilidades de red) |
| `egress-guard.ts` | ✅ Probado (SSRF prevention) |
| `executors.ts` | ✅ Probado (tool execution) |
| `supabase-live-test.mjs` | 🟡 Live tests (requiere BD real) |

### E2E & Penetración (Playwright)

```bash
pnpm test:e2e          # Ejecutar todos los tests E2E
npx playwright test    # Con interfaz gráfica
```

**Tests incluidos:**
- Autenticación (login, callback, magic link)
- Rate limiting (20+ requests en 60s, bypass por IP rotation)
- CSP (bloqueo de inline scripts maliciosos)
- Open redirect (next parameters maliciosos)
- Visual regression (login, ScoreGauge, AttackSurfaceGraph)

### CI/CD Pipeline

El pipeline de GitHub Actions ejecuta:
1. Lint (ESLint)
2. TypeScript type-check
3. Tests unitarios con cobertura
4. Tests de penetración con Playwright
5. Upload de cobertura a Codecov

---

## 🌐 API & Endpoints

### AI & Copilot

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/ai/copilot` | POST | Chat con AI Copilot de infraestructura |
| `/api/ai/report` | POST | Generar reporte SEO ejecutivo |
| `/api/ai/healthcheck` | GET | Health check de modelos AI |

### Inteligencia

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/intelligence` | GET/POST | Investigaciones de inteligencia |
| `/api/intelligence/copilot` | POST | Plan de remediación técnica |
| `/api/intelligence/brief` | POST | Incident Brief ejecutivo |
| `/api/intelligence/health` | GET | Estado del engine de inteligencia |
| `/api/intelligence/runs` | POST | Ejecutar herramientas |
| `/api/intelligence/drift` | GET/POST | Análisis de drift de seguridad |
| `/api/intelligence/assets/graph` | GET | Graph de activos descubiertos |

### Seguridad

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/security/audit-logs` | GET | Logs de auditoría (paginados) |
| `/api/security/siem-alerts` | GET | Historial de alertas SIEM |
| `/api/security/csp-report` | POST | Reportes de violación CSP |
| `/api/security/siem/run` | POST | Ejecutar SIEM exporter manualmente |
| `/api/security/siem/test` | GET | Probar conectividad de webhooks |

### Auth

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/auth/validate-email` | POST | Validación de email en tiempo real |
| `/auth/callback` | GET | Callback de Magic Link |

### Monitoreo

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/monitoring` | GET | Estado de monitoreo de proyectos |
| `/api/telemetry/vitals` | POST | Web Vitals desde RUM |
| `/api/webhooks` | POST | Webhooks de integración externa |

### Cron (Vercel Cron Jobs)

| Endpoint | Schedule | Descripción |
|----------|----------|-------------|
| `/api/cron/uptime` | `0 0 * * *` (diario) | Verificación de uptime |
| `/api/cron/siem` | `*/5 * * * *` (cada 5 min) | SIEM exporter |
| `/api/ai/healthcheck` | `0 */6 * * *` (cada 6h) | Health check de modelos AI |

---

## 🚢 Deploy

### Vercel (recomendado)

El proyecto está preconfigurado para Vercel con output standalone:

```bash
# 1. Conectar repo a Vercel
vercel connect

# 2. Configurar variables de entorno en Vercel Dashboard
# Ver sección "Configuración" arriba

# 3. Deploy
vercel --prod
```

El archivo `vercel.json` ya incluye:
- Framework `nextjs` con standalone output
- Cron jobs para uptime, SIEM y health check
- Configuración de imágenes

**Importante:** NO configurar `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` en producción — el guard `NODE_ENV === 'development'` lo desactiva automáticamente.

### Base de datos

Las migraciones se ejecutan automáticamente al hacer `pnpm db:push`. Para entornos de producción:

1. Configurar `DIRECT_URL` en Vercel (la URL directa de Supabase)
2. Ejecutar `pnpm db:push` en el pipeline de CI o manualmente

---

## 🤝 Contribuir

1. Hacer fork del repositorio
2. Crear rama: `git checkout -b feature/nueva-funcionalidad`
3. Commit: `git commit -m 'feat: agregar nueva funcionalidad'`
4. Push: `git push origin feature/nueva-funcionalidad`
5. Abrir Pull Request

### Convenciones

- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `security:`, `docs:`, `refactor:`)
- **Branch**: `feature/`, `fix/`, `security/`, `docs/`
- **Tests**: Toda nueva funcionalidad debe incluir tests unitarios

---

## 📄 Licencia

MIT © [StrategicConnex](https://github.com/StrategicConnex)

---

<p align="center">
  <sub>Built with ❤️ by the StrategicConnex Team</sub><br>
  <sub>© 2026 StrategicConnex — Enterprise Cyber Intelligence</sub>
</p>
