---
layout: default
title: Instalación
nav_order: 2
permalink: /docs/installation
---

# Instalación

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

## Requisitos

| Requisito | Versión |
|-----------|---------|
| Node.js | >= 20 |
| pnpm | >= 9 |
| PostgreSQL | 15+ (vía Supabase) |
| Redis | 6+ (vía Upstash) |

### Cuentas requiredas

| Servicio | Propósito | Gratuito |
|----------|-----------|----------|
| [Supabase](https://supabase.com) | Base de datos + Auth | ✅ Sí |
| [Upstash](https://upstash.com) | Redis para rate limiting | ✅ Sí |
| [OpenRouter](https://openrouter.ai/keys) | Modelos de IA gratuitos | ✅ Sí (sin tarjeta) |
| [Vercel](https://vercel.com) | Hosting | ✅ Sí (Hobby) |

---

## Instalación local

### 1. Clonar el repositorio

```bash
git clone https://github.com/StrategicConnex/StrategicConnexAudit.git
cd StrategicConnexAudit
```

### 2. Instalar dependencias

```bash
pnpm install
```

### 3. Configurar variables de entorno

```bash
cp .env.example .env.local
```

Editar `.env.local` con tus credenciales:

```env
# ─── Obligatorias ─────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DIRECT_URL=postgresql://...
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# ─── AI (opcional, gratis) ────────────────────
OPENROUTER_API_KEY=sk-or-v1-...

# ─── SIEM Webhooks (opcional) ─────────────────
SIEM_WEBHOOK_SLACK=https://hooks.slack.com/...
SIEM_WEBHOOK_PAGERDUTY=https://events.pagerduty.com/...
SIEM_WEBHOOK_SPLUNK=https://http-inputs-mysplunk.splunkcloud.com/...

# ─── Push Notifications (opcional) ────────────
VAPID_PUBLIC_KEY=xxx
VAPID_PRIVATE_KEY=xxx

# ─── Desarrollo (opcional) ────────────────────
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

### 4. Ejecutar migraciones

```bash
pnpm db:push
```

### 5. Iniciar servidor

```bash
pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000).

---

## Configuración de la base de datos

### Esquema

El proyecto usa **Drizzle ORM** con 30+ tablas en PostgreSQL. Los esquemas están en `src/shared/db/schemas/`:

| Archivo | Tablas |
|---------|--------|
| `index.ts` | Users, Projects, Audits, Crawl Results, Issues, Keywords, Backlinks, A/B Tests, etc. |
| `intelligence.ts` | Investigations, Tool Runs, Findings, Assets, Usage Events |
| `monitoring.ts` | Monitoring Schedules, Alerts, API Keys, Webhook Configs |
| `security-audit.ts` | Security Audit Logs, SIEM Alert Logs |
| `health.ts` | AI Health Check Logs |
| `push-subscriptions.ts` | Browser Push Notification Subscriptions |

### Migraciones

```bash
pnpm db:generate    # Generar migración desde los schemas
pnpm db:push        # Aplicar migraciones a Supabase
```

Las migraciones se almacenan en `drizzle/` (9 migrations hasta la fecha).

---

## Configuración de servicios

### Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. En Settings → Database → Connection string, copiar `DIRECT_URL`
3. En Settings → API, copiar `anon public` y `service_role` keys
4. Ejecutar `pnpm db:push` para crear las tablas

### Upstash Redis

1. Crear base de datos Redis en [upstash.com](https://upstash.com)
2. Copiar `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`

### OpenRouter (AI)

1. Ir a [openrouter.ai/keys](https://openrouter.ai/keys)
2. Crear cuenta (sin tarjeta de crédito)
3. Generar API Key — copiar como `OPENROUTER_API_KEY`
4. Límite gratuito: 50 requests/día (sin pago) o 1,000/día (con $10+ de por vida)

### VAPID Keys (Push Notifications)

```bash
npx web-push generate-vapid-keys
```

Copiar los valores a `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY`.

---

## Dev Bypass Auth

Para desarrollo local sin necesidad de autenticarse en Supabase cada vez:

```env
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

Esto permite:
- Navegar el dashboard sin login
- Crear proyectos con un usuario sintético (`dev-bypass-user`)
- Usar `directDb` en vez de `withRLS` (bypassea Row Level Security)

{: .warning }
Nunca configurar `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` en producción. El guard `process.env.NODE_ENV === 'development'` lo desactiva automáticamente en Vercel.

---

## Deploy en Vercel

```bash
# Vincular proyecto
npx vercel link

# Configurar variables de entorno
npx vercel env add

# Deploy a producción
npx vercel --prod
```

O configurar desde el dashboard de Vercel apuntando al repositorio de GitHub con `main` como rama de producción.
