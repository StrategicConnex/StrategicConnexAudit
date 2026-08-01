---
layout: default
title: Instalación
nav_order: 2
permalink: /docs/installation
---

# Guía de Instalación — StrategicAudit Pro (SCAUDIT)

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

Esta guía te llevará desde **cero a servidor corriendo** con todos los servicios configurados. Cada sección incluye instrucciones paso a paso, descripciones de lo que verás en cada pantalla, y resolución de problemas comunes.

---

## Requisitos del sistema

| Requisito | Versión Mínima | Cómo verificarlo |
|-----------|---------------|------------------|
| Node.js | >= 20 | `node --version` |
| pnpm | >= 9 | `pnpm --version` |
| Git | >= 2.30 | `git --version` |
| Sistema Operativo | macOS 12+, Windows 10+, Ubuntu 20.04+ | — |

### Cuentas requeridas

| Servicio | Propósito | Plan Gratuito | Tiempo de Setup |
|----------|-----------|---------------|-----------------|
| [Supabase](https://supabase.com) | Base de datos PostgreSQL + Auth + RLS | 500 MB, 50,000 filas, 50,000 auth users | 10 min |
| [Upstash](https://upstash.com) | Redis serverless para rate limiting | 10,000 commands/día, 256 MB | 5 min |
| [OpenRouter](https://openrouter.ai/keys) | Modelos de IA gratuitos (Gemini, DeepSeek, Llama) | 50 req/día gratis (sin tarjeta) | 5 min |
| [Vercel](https://vercel.com) | Hosting del sitio | Hobby (gratis, 100 GB ancho de banda) | 5 min |
| [Trigger.dev](https://trigger.dev) | Background jobs (SIEM, discovery, cron) | Gratuito (3 tasks, 10k runs/mes) | 5 min |

{: .note }
Todos los servicios tienen **planes gratuitos generosos** que cubren desarrollo y producción pequeña. No necesitas tarjeta de crédito para empezar.

---

## ⚡ Quick Start (5 minutos)

Si ya tienes todas las cuentas, esto es todo lo que necesitas:

```bash
# 1. Clonar
git clone https://github.com/StrategicConnex/StrategicConnexAudit.git
cd StrategicConnexAudit

# 2. Instalar dependencias
pnpm install

# 3. Copiar y configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales (ver secciones abajo)

# 4. Migrar base de datos
pnpm db:push

# 5. Iniciar servidor de desarrollo
pnpm dev
# → Abrir http://localhost:3000
```

Si encuentras errores, sigue las guías detalladas de cada servicio a continuación.

---

## 1. Supabase — Base de Datos y Autenticación

### 1.1 Crear el proyecto

1. Ve a [supabase.com](https://supabase.com) y haz clic en **Start your project**
2. Inicia sesión con GitHub (recomendado) o email
3. En el dashboard, haz clic en **New project**

```
┌─────────────────────────────────────────────────────────┐
│  Create a new project                                   │
│                                                         │
│  Name:          [strategicaudit-pro              ]      │
│  Database Password: [•••••••••••••••••••••••••••]      │
│  Region:        [US East (N. Virginia)          ▼]      │
│  Pricing Plan:  ○ Free ● Pro ○ Team ○ Enterprise       │
│                                                         │
│  [Create new project]       ← Haz clic aquí             │
└─────────────────────────────────────────────────────────┘
```

{: .tip }
**Región:** Elige la más cercana a tu audiencia. Para Latinoamérica, `US East (N. Virginia)` o `São Paulo` son buenas opciones.

{: .warning }
**Database Password:** Guárdala en un gestor de contraseñas. La necesitarás para la variable `DATABASE_URL` y `DIRECT_URL`.

### 1.2 Obtener credenciales

Una vez creado el proyecto (tarda ~2 minutos), verás el dashboard principal:

1. **Project Settings → API** (barra lateral izquierda → Settings → API)

```
┌─────────────────────────────────────────────────────────┐
│  Project Settings  │  API                                │
│                                                         │
│  URL:   https://abcdefghijklm.supabase.co                │
│         ↑ Cópialo como NEXT_PUBLIC_SUPABASE_URL          │
│                                                         │
│  anon public key:                                       │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...               │
│  ↑ Cópialo como NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY    │
│                                                         │
│  service_role key:                                      │
│  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...               │
│  ↑ Cópialo como SUPABASE_SERVICE_ROLE_KEY               │
└─────────────────────────────────────────────────────────┘
```

2. **Project Settings → Database → Connection string**

```
┌─────────────────────────────────────────────────────────┐
│  Connection string                                      │
│                                                         │
│  URI: postgresql://postgres:[password]@db.xxxxx.         │
│       supabase.co:5432/postgres                          │
│       ↑ Cópialo como DIRECT_URL (cambia :5432)          │
│                                                         │
│  Pooler URI: postgresql://postgres:[password]@xxxxx.     │
│       pooler.supabase.com:6543/postgres                  │
│       ↑ Cópialo como DATABASE_URL (cambia :6543)        │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Configurar autenticación Magic Link

Para que el login con Magic Link funcione:

1. **Authentication → Settings** (barra lateral)
2. En **Site URL**, pon la URL de tu app:
   - Desarrollo: `http://localhost:3000`
   - Producción: `https://scaudit.vercel.app` (o tu dominio)

```
┌─────────────────────────────────────────────────────────┐
│  Authentication Settings                                 │
│                                                         │
│  Site URL: [http://localhost:3000                ]      │
│  Redirect URLs:                                         │
│  [http://localhost:3000/**                      ]      │
│  [https://scaudit.vercel.app/**                 ]      │
│  [Add URL]                                              │
│                                                         │
│  [Save]  ← No olvides guardar                           │
└─────────────────────────────────────────────────────────┘
```

3. En **Authentication → Providers**, asegúrate de que **Email** está habilitado:
   - Enable email signup: **ON**
   - Confirm email: **OFF** (usamos Magic Link, no necesitamos confirmación)
   - Secure email change: **ON**

```
┌─────────────────────────────────────────────────────────┐
│  Email Auth Provider                                    │
│                                                         │
│  Enable email signup:            ● ON                    │
│  Confirm email:                  ○ OFF                   │
│  Secure email change:            ● ON                    │
│                                                         │
│  [Save]                                                 │
└─────────────────────────────────────────────────────────┘
```

### 1.4 Ejecutar migraciones

Con las credenciales en `.env.local`, ejecuta:

```bash
pnpm db:push
```

Resultado esperado:

```
$ pnpm db:push
> strategicaudit-pro@ db:push /StrategicAudit Pro/strategicaudit-pro
> drizzle-kit push

[✓] Introspected database
[✓] Tables: audits, projects, crawl_results, issues, keywords, backlinks,
    ab_test_variants, integrations_gsc, integrations_ga4,
    keyword_targets, monitoring_schedules, monitoring_alerts,
    intelligence_investigations, intelligence_tool_runs,
    intelligence_findings, intelligence_assets, asset_changes,
    developer_api_keys, security_audit_logs, siem_alert_logs,
    ai_health_logs, push_subscriptions, webhook_configs
[✓] Applied migrations (10 files)
```

{: .warning }
Si ves `Error: DIRECT_URL is missing`, asegúrate de haber copiado `.env.example` a `.env.local` y haber llenado `DIRECT_URL`.

{: .tip }
**Solución de errores de migración:**
- `Error: password authentication failed`: Verifica que la contraseña en `DIRECT_URL` no tenga caracteres especiales como `@`, `#`, `$` — si los tiene, usa URL encoding (`@` → `%40`, `#` → `%23`)
- `Error: connect ECONNREFUSED`: Verifica que el proyecto de Supabase esté activo (no pausado por inactividad)
- `Error: SSL connection`: Agrega `DB_ALLOW_INSECURE_SSL=true` en `.env.local` si usas conexión directa sin SSL

### 1.5 Verificar conexión

```bash
pnpm test-db
# o
npx tsx src/shared/db/test.ts
```

Resultado esperado:
```
$ npx tsx src/shared/db/test.ts
[DB Test] ✅ Conectado a Supabase
[DB Test] ✅ Tablas encontradas: 22
[DB Test] ✅ RLS habilitado en tablas principales
```

---

## 2. Upstash Redis — Rate Limiting y Caché

### 2.1 Crear base de datos Redis

1. Ve a [upstash.com](https://upstash.com) y crea cuenta (GitHub o email)
2. En el dashboard, haz clic en **Create database**

```
┌─────────────────────────────────────────────────────────┐
│  Create Serverless Redis                                 │
│                                                         │
│  Database Name:  [scaudit-ratelimit               ]     │
│  Region:         [US-East  ▼]                           │
│  Global:         ○ Disable ● Enable (recommended)       │
│  Eviction:       [noeviction ▼]                         │
│  TTL:            [Enabled - auto delete keys       ▼]   │
│  Maximum Size:   [256  MB  ▼]                           │
│                                                         │
│  [Create]  ← Haz clic aquí                              │
└─────────────────────────────────────────────────────────┘
```

{: .tip }
**Enable Global** permite que Redis esté disponible en múltiples regiones. Para desarrollo no es necesario, pero para producción ayuda con la latencia de rate limiting.

### 2.2 Obtener credenciales

Una vez creada, verás la pantalla de detalles:

```
┌─────────────────────────────────────────────────────────┐
│  REST API                                               │
│                                                         │
│  REST URL:  https://useful-llama-12345.upstash.io       │
│             ↑ Cópialo como UPSTASH_REDIS_REST_URL       │
│                                                         │
│  REST Token: AXNkAAIjcDE0NTY3ODkw...                   │
│              ↑ Cópialo como UPSTASH_REDIS_REST_TOKEN    │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Verificar conexión

```bash
curl -s -X GET "$UPSTASH_REDIS_REST_URL/ping" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
```

Resultado esperado:
```json
{"result":"PONG"}
```

### 2.4 Configurar en Vercel (producción)

En Vercel Dashboard → Settings → Environment Variables, agrega:

| Variable | Valor |
|----------|-------|
| `UPSTASH_REDIS_REST_URL` | `https://xxxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | `AXNkAAIjcDE0NTY3ODkw...` |

{: .warning }
**¿La DB fue eliminada?** Si el ping responde `HTTP 000` y el subdominio no resuelve DNS, la base de datos fue borrada (no pausada). No intentes reutilizar la URL vieja — sigue la [Guía de Recuperación de Upstash Redis](/docs/guides/upstash-redis-recovery) para recrearla y rotar las credenciales en `.env.local`, `.env.test` y Vercel.

---

## 3. OpenRouter — Modelos de IA Gratuitos

### 3.1 Crear cuenta y API Key

1. Ve a [openrouter.ai/keys](https://openrouter.ai/keys)
2. Haz clic en **Sign Up** (GitHub o Google — sin tarjeta de crédito)
3. Una vez dentro, ve a **Keys**

```
┌─────────────────────────────────────────────────────────┐
│  API Keys                                                │
│                                                         │
│  [Create Key]  ← Haz clic aquí                          │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Key Name:    [scaudit-pro                   ]   │   │
│  │  Permissions: ● Read ○ Write ○ Admin            │   │
│  │  Limits:      [1000  requests/day        ▼]     │   │
│  │                                                   │   │
│  │  [Create]                                          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

4. Copia la key generada:

```
┌─────────────────────────────────────────────────────────┐
│  Your API Key                                           │
│                                                         │
│  sk-or-v1-a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v │
│  ↑ Cópialo como OPENROUTER_API_KEY                      │
│                                                         │
│  [Copy and close]  ← Haz clic y guárdala ya            │
└─────────────────────────────────────────────────────────┘
```

{: .warning }
La key solo se muestra **una vez**. Si la pierdes, tendrás que crear otra.

### 3.2 Entender los modelos gratuitos

SCAUDIT usa automáticamente estos modelos gratuitos de OpenRouter (en orden de fallback):

| Modelo | ID en OpenRouter | Velocidad | Calidad |
|--------|------------------|-----------|---------|
| Gemini 2.0 Flash | `google/gemini-2.0-flash-exp:free` | ⚡ Rápido | 🏆 Alta |
| DeepSeek V3 | `deepseek/deepseek-chat:free` | ⚡ Rápido | 🏆 Alta |
| Llama 4 Maverick | `meta-llama/llama-4-maverick-17b-128e-instruct:free` | 🟡 Medio | 🏆 Alta |
| Mistral 7B | `mistralai/mistral-7b-instruct:free` | ⚡ Rápido | 🟡 Media |
| Nemotron | `nvidia/llama-nemotron-nas-4b-instruct:free` | ⚡ Rápido | 🟡 Media |
| Qwen 2.5 | `qwen/qwen2.5-vl-72b-instruct:free` | 🐢 Lento | 🏆 Alta |
| Gemma 4 | `google/gemma-4-26b-a4b-it:free` | 🟡 Medio | 🏆 Alta |

### 3.3 Límites gratuitos

| Sin pago (default) | Con $10+ de por vida |
|--------------------|----------------------|
| 50 requests/día | 1,000 requests/día |
| 5 requests/minuto | 20 requests/minuto |
| Solo modelos `:free` | Todos los modelos |
| Sin prioridad | Prioridad media |

{: .note }
Para desarrollo local, 50 requests/día son suficientes. Si necesitas más, puedes recargar $10 en OpenRouter (te dura meses).

### 3.4 Verificar conectividad

```bash
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemini-2.0-flash-exp:free",
    "messages": [{"role":"user","content":"Hola, responde solo OK"}]
  }' | head -c 200
```

Resultado esperado:
```json
{"id":"gen-xxxx","choices":[{"message":{"role":"assistant","content":"OK"}}],...}
```

---

## 4. Trigger.dev — Background Jobs

### 4.1 Crear proyecto en Trigger.dev

1. Ve a [trigger.dev](https://trigger.dev) y crea cuenta (GitHub recomendado)
2. Haz clic en **New Project**

```
┌─────────────────────────────────────────────────────────┐
│  Create a new project                                    │
│                                                         │
│  Name:              [strategicaudit-pro            ]     │
│  Framework:         [Next.js ▼]                         │
│  Git Repository:    [Connect GitHub... ▼]               │
│                                                         │
│  [Create project]  ← Haz clic aquí                      │
└─────────────────────────────────────────────────────────┘
```

3. En **Settings → API Keys**, copia tu `TRIGGER_SECRET_KEY`

### 4.2 Configurar en el proyecto

La configuración ya está en `trigger.config.ts`:

```typescript
export default defineConfig({
  project: "proj_vzzxtydwblfhxgmljiai", // ID del proyecto en Trigger.dev
  runtime: "node",
  dirs: ["./src/trigger"],               // 📁 Donde están los tasks
  retries: {
    enabledInDev: true,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10000, factor: 2, randomize: true },
  },
  maxDuration: 3600,                     // 1 hora máximo
});
```

En `.env.local`:
```env
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxx
```

### 4.3 Tasks configurados

| Task | Archivo | Schedule | Descripción |
|------|---------|----------|-------------|
| SIEM Exporter | `src/trigger/siem.trigger.ts` | Cada 5 min | Detecta patrones de seguridad y envía alertas |
| Continuous Discovery | `src/trigger/discovery.trigger.ts` | Cada 6h | Descubrimiento de subdominios, CT logs, shadow assets |
| API Key Expiry | `src/trigger/api-key-expiry.trigger.ts` | Diario 09:00 UTC | Alerta cuando keys están por expirar |
| Audit | `src/trigger/audit.trigger.ts` | Bajo demanda | Ejecuta auditorías técnicas |
| Monitoring | `src/trigger/monitoring.trigger.ts` | Bajo demanda | Monitoreo de infraestructura |
| Uptime | `src/trigger/uptime.trigger.ts` | Diario | Verificación de uptime de proyectos |
| Webhook | `src/trigger/webhook.trigger.ts` | Bajo demanda | Delivery de webhooks |

### 4.4 Verificar conexión

```bash
npx trigger.dev deploy
```

---

## 5. VAPID Keys — Push Notifications (Opcional)

Necesitas generar un par de claves VAPID para las notificaciones push al navegador:

```bash
npx web-push generate-vapid-keys
```

Resultado:
```
=======================================
Public Key:
BDFIalj3k...lF7omjaW0z4a3E

Private Key:
a1b2c3d4e5...f6g7h8i9j0k
=======================================
```

Agrega a `.env.local`:
```env
VAPID_PUBLIC_KEY=BDFIalj3k...lF7omjaW0z4a3E
VAPID_PRIVATE_KEY=a1b2c3d4e5...f6g7h8i9j0k
```

---

## 6. SIEM Webhooks (Opcional)

Para habilitar alertas de seguridad, configura al menos uno de estos canales:

### Slack

1. Ve a [api.slack.com/apps](https://api.slack.com/apps)
2. **Create New App → From scratch**
3. Nómbrala "SCAUDIT SIEM"
4. En **Incoming Webhooks**, activa el toggle y crea un webhook

```
┌─────────────────────────────────────────────────────────┐
│  Webhook URL:                                           │
│  https://hooks.slack.com/services/T00/B000/XXXXXXXXXX   │
│  ↑ Cópialo como SIEM_WEBHOOK_SLACK                      │
└─────────────────────────────────────────────────────────┘
```

### Email (Resend)

1. Ve a [resend.com](https://resend.com) y crea cuenta
2. Ve a **API Keys** y crea una key

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
SIEM_EMAIL_FROM=alerts@scaudit.com    # Remitente (verificado en Resend)
SIEM_EMAIL_TO=admin@tuempresa.com      # Destinatario de alertas
```

### PagerDuty

1. En tu cuenta de PagerDuty, ve a **Integrations → Event Orchestration**
2. Crea una nueva integración **Events API v2**

```env
SIEM_WEBHOOK_PAGERDUTY=https://events.pagerduty.com/v2/enqueue/
SIEM_PAGERDUTY_ROUTING_KEY=xxxxxxxxxxxxxxxxx
```

### Splunk

```env
SIEM_WEBHOOK_SPLUNK=https://http-inputs-mysplunk.splunkcloud.com:8088/services/collector/event
```

---

## 7. Variables de Entorno — Referencia Completa

### Obligatorias (sin esto no funciona)

| Variable | Dónde obtenerla | Propósito |
|----------|----------------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | URL base de Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API | Anon key de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Service role (bypass RLS) |
| `DATABASE_URL` | Supabase → Database → Connection string (pooler :6543) | Conexión principal a DB |
| `DIRECT_URL` | Supabase → Database → Connection string (direct :5432) | Migraciones + workers |
| `UPSTASH_REDIS_REST_URL` | Upstash → Database → REST URL | Rate limiting API |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash → Database → REST Token | Auth para Redis |
| `CRON_SECRET` | Tú lo generas | Protege endpoints de cron |

### Opcionales (recomendadas)

| Variable | Default | Propósito |
|----------|---------|-----------|
| `OPENROUTER_API_KEY` | — | Modelos de IA (sin esto, fallback a texto plano) |
| `TRIGGER_SECRET_KEY` | — | Background jobs (Trigger.dev) |
| `VAPID_PUBLIC_KEY` | — | Push notifications |
| `VAPID_PRIVATE_KEY` | — | Push notifications |
| `SIEM_WEBHOOK_SLACK` | — | Alertas de seguridad a Slack |
| `SIEM_WEBHOOK_PAGERDUTY` | — | Alertas a PagerDuty |
| `SIEM_WEBHOOK_SPLUNK` | — | Alertas a Splunk |
| `SIEM_PAGERDUTY_ROUTING_KEY` | — | Routing key de PagerDuty |
| `RESEND_API_KEY` | — | Email alerts |
| `SIEM_EMAIL_FROM` | — | Remitente de alertas email |
| `SIEM_EMAIL_TO` | — | Destinatario de alertas email |
| `AUTH_EMAIL_ALLOWLIST` | — | Emails que **saltan el rate limit del login** (comma-separated). El email del owner (`palacios_juan@hotmail.com`) ya está incluido por defecto en código; agrega cuentas adicionales aquí sin modificar código |

### Desarrollo (solo local)

| Variable | Propósito |
|----------|-----------|
| `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` | Saltea autenticación en desarrollo |
| `DB_ALLOW_INSECURE_SSL=true` | Permite conexiones SSL inseguras |

### Legado (mantenido por compatibilidad)

| Variable | Propósito |
|----------|-----------|
| `Bearer_API_KEY` | API Key alternativa (reemplazada por OpenRouter) |
| `GEMINI_API_KEY` | Google Gemini API Key (reemplazada por OpenRouter) |
| `XIAOMI_BASE_URL` | URL alternativa para modelos |

---

## 8. Dev Bypass Auth

Para **desarrollo local**, puedes saltear la autenticación de Supabase:

```env
NEXT_PUBLIC_DEV_BYPASS_AUTH=true
```

Esto permite:
- Navegar el dashboard **sin hacer login**
- Crear proyectos con un usuario sintético (`dev-bypass-user`)
- Usar `directDb` en vez de `withRLS` (bypassea Row Level Security)
- Probar todas las funcionalidades sin configurar Magic Links

{: .danger }
**NUNCA configures `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` en producción.** El código tiene un guard `process.env.NODE_ENV === 'development'` que lo desactiva automáticamente en Vercel, pero por seguridad no lo incluyas en las variables de entorno de Vercel.

---

## 9. Configuración de CI/CD

El pipeline de GitHub Actions ejecuta lint, tests, y coverage automáticamente.

### Secretos de GitHub

Agrega estos secretos en **GitHub → Settings → Secrets and variables → Actions**:

| Secreto | Propósito |
|---------|-----------|
| `CODECOV_TOKEN` | Upload de cobertura a Codecov |
| `SCAUDIT_API_KEY` | API key para tests de contrato | 

### Variables de entorno en Vercel

Todas las variables de `.env.local` deben configurarse en **Vercel Dashboard → Settings → Environment Variables** (en Producción y Preview).

Método rápido con CLI:
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add DATABASE_URL
vercel env add DIRECT_URL
vercel env add UPSTASH_REDIS_REST_URL
vercel env add UPSTASH_REDIS_REST_TOKEN
vercel env add CRON_SECRET
vercel env add OPENROUTER_API_KEY
vercel env add AUTH_EMAIL_ALLOWLIST   # opcional — emails con bypass de rate limit del login
# ... y las opcionales que necesites
```

---

## 10. Solución de Problemas

### Error: `The "middleware" file convention is deprecated`

```
Error: The "middleware" file convention is deprecated. Please use "proxy" instead.
```

**Solución:** Next.js 16 reemplazó `middleware.ts` por `proxy.ts`. El proyecto ya usa `src/proxy.ts`. Si tienes ambos archivos, elimina `src/middleware.ts`.

```bash
rm src/middleware.ts
```

### Error: `DIRECT_URL is missing`

```
Error: La variable de entorno DIRECT_URL falta en la configuración de drizzle
```

**Solución:** Asegúrate de que `.env.local` existe y tiene `DIRECT_URL`. Copia desde `.env.example`:

```bash
cp .env.example .env.local
# Editar DIRECT_URL con la URL de Supabase
```

### Error: `password authentication failed` en migraciones

```
Error: password authentication failed for user "postgres"
```

**Soluciones posibles:**
1. La contraseña en `DIRECT_URL` tiene caracteres especiales — usa URL encoding
2. El proyecto de Supabase está pausado — entra al dashboard para reactivarlo
3. Usaste la URL del pooler (`:6543`) en `DIRECT_URL` — debe ser la directa (`:5432`)

### Error: `relation "xxx" does not exist`

```
Error: relation "audits" does not exist
```

**Solución:** Las migraciones no se ejecutaron. Corre:

```bash
pnpm db:push
```

### Error: `Failed to fetch` en Magic Link

```
TypeError: Failed to fetch
```

**Soluciones posibles:**
1. Verifica que `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` son correctos
2. En Supabase → Authentication → Settings, verifica que `Site URL` incluye `http://localhost:3000`
3. Si estás en producción, verifica que las variables de entorno están configuradas en Vercel

### Error: `eval() is not supported` en desarrollo

```
eval() is not supported in this environment. If this page was served
with a Content-Security-Policy header, make sure that `unsafe-eval`
is included.
```

**Solución:** El proxy de Next.js 16 aplica CSP. En desarrollo, el código automáticamente agrega `'unsafe-eval'` cuando detecta `NODE_ENV=development`. Si el problema persiste, limpia el caché de Turbopack:

```bash
rm -rf .next
pnpm dev
```

### Error: `Both middleware file and proxy file are detected`

```
Error: Both middleware file "./src\middleware.ts" and proxy file
"./src\proxy.ts" are detected.
```

**Solución:** Next.js 16 migró de middleware a proxy. Si migraste de una versión anterior, elimina el archivo `middleware.ts`:

```bash
rm src/middleware.ts
```

### Verificación rápida de todo

```bash
# 1. Conexión a Supabase
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | head -c 100

# 2. Redis conectividad
curl -s -X GET "$UPSTASH_REDIS_REST_URL/ping" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"

# 3. AI conectividad
curl -s -X POST https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemini-2.0-flash-exp:free","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  | head -c 100
```

---

## 11. Post-Install: Verificar que todo funciona

Una vez que el servidor de desarrollo está corriendo (`pnpm dev`):

### Health check local

```bash
curl http://localhost:3000/api/public/v1/health
```

Respuesta esperada:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-07-29T12:00:00.000Z",
  "services": {
    "redisConfigured": true,
    "dbConfigured": true
  }
}
```

### Login page

Visita [http://localhost:3000/login](http://localhost:3000/login). Deberías ver:
- Campo de email con validación en tiempo real
- Botón de Magic Link
- Diseño oscuro profesional con la paleta índigo + chartreuse

### Probar AI Copilot

```bash
curl -s -X POST http://localhost:3000/api/ai/copilot \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hola, ¿qué puedes hacer?"}]}'
```

### Ver rate limiting

```bash
# Esto debería funcionar (primer request)
curl -s http://localhost:3000/api/public/v1/health | head -c 100

# Ver headers de rate limit
curl -s -D - http://localhost:3000/api/intelligence/health 2>&1 | grep -i rate-limit
```

---

## Resumen de archivos de configuración

| Archivo | Propósito |
|---------|-----------|
| `.env.example` | Template con todas las variables documentadas |
| `.env.local` | Variables locales (gitignorado) |
| `drizzle.config.ts` | Configuración de migraciones Drizzle |
| `trigger.config.ts` | Configuración de Trigger.dev |
| `next.config.ts` | Configuración de Next.js |
| `vercel.json` | Configuración de deploy en Vercel |
| `.github/workflows/ci.yml` | Pipeline CI/CD |

---

## Alcance y objetivos

Esta guía documenta la instalación de SCAUDIT Pro de **cero a servidor corriendo**, cubriendo: provisión de los servicios externos (Supabase, Upstash Redis, OpenRouter, Trigger.dev), configuración de las variables de entorno, migraciones de base de datos y verificación post-instalación en desarrollo y producción.

**Objetivos:**

1. Llevar un entorno local funcional en ≤ 30 minutos (Quick Start §Quick Start)
2. Documentar cada variable de entorno con su fuente y propósito (§7)
3. Permitir verificar cada servicio de forma aislada antes de arrancar la app (§1.5, §2.3, §3.4)
4. Dejar producción desplegada en Vercel con autenticación y rate limiting funcionales

---

## Flujos

### FLOW-001 — Secuencia de instalación end-to-end

```mermaid
sequenceDiagram
  participant Dev as Desarrollador
  participant SB as Supabase
  participant US as Upstash
  participant OR as OpenRouter
  participant TD as Trigger.dev
  participant VC as Vercel
  Dev->>SB: Crear proyecto + credenciales
  SB-->>Dev: URL + anon key + service_role
  Dev->>US: Crear DB Redis
  US-->>Dev: REST URL + REST Token
  Dev->>OR: Crear API Key
  OR-->>Dev: OPENROUTER_API_KEY
  Dev->>TD: Crear proyecto
  TD-->>Dev: TRIGGER_SECRET_KEY
  Dev->>Dev: pnpm db:push (migraciones Drizzle)
  Dev->>VC: Deploy (pnpm build)
  VC-->>Dev: https://scaudit.vercel.app
```

### FLOW-002 — Login con Magic Link

```mermaid
flowchart LR
  A[Ingresar email] --> B[POST /api/auth/validate-email]
  B --> C{Validación anti-spam}
  C -->|400+ dominios bloqueados| D[400 error]
  C -->|OK| E[Rate limit 20/60s]
  E --> F[Supabase envía Magic Link]
  F --> G[Click en link]
  G --> H[/auth/callback]
  H --> I[Anti-open-redirect]
  I --> J[Dashboard]
```

---

## Testing de la instalación

### TEST-001 — Verificación post-instalación

| Caso | Comando | Resultado esperado |
|------|---------|--------------------|
| Conexión a Supabase | `pnpm test-db` | `[DB Test] ✅ Conectado a Supabase` |
| Tablas presentes | `pnpm test-db` | `Tablas encontradas: 22` |
| RLS habilitado | `pnpm test-db` | `RLS habilitado en tablas principales` |
| Redis conectividad | `curl -X GET $UPSTASH_REDIS_REST_URL/ping` | `{"result":"PONG"}` |
| AI conectividad | `curl POST openrouter.ai/api/v1/chat/completions` | `choices[0].message.content` |
| Health local | `curl http://localhost:3000/api/public/v1/health` | `{"status":"ok"}` |
| Login page | Navegar a `/login` | Formulario + botón Magic Link |

---

## Operaciones y runbooks

### RUNBOOK-001 — Diagnóstico rápido de una instalación fallida

1. Verificar versiones: `node --version` (≥ 20), `pnpm --version` (≥ 9)
2. Verificar `.env.local`: `grep -c '=' .env.local` (todas las obligatorias presentes)
3. Ping a Redis: `curl -X GET "$UPSTASH_REDIS_REST_URL/ping"` → `PONG`
4. Consulta a Supabase: `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/"` con anon key → HTTP 200
5. Migraciones: `pnpm db:push` → `[✓] Applied migrations (10 files)`
6. Si el ping de Redis responde `HTTP 000` y el subdominio no resuelve DNS, la DB fue **eliminada** → seguir la [Guía de Recuperación de Upstash Redis](/docs/guides/upstash-redis-recovery)

**Monitoreo:** tras el deploy, verificar headers de rate limit en `/api/intelligence/health` (`x-ratelimit-*`) y el health endpoint público (`redisConfigured`, `dbConfigured`).

---

## Inventario visual

| ID | Tipo | Descripción | Audiencia | Nivel |
|----|------|-------------|-----------|-------|
| FLOW-001 | Diagrama de secuencia | Secuencia de instalación end-to-end | Ops / DevOps | L2 |
| FLOW-002 | Flowchart | Flujo de login Magic Link | Desarrollador | L2 |

---

## Trazabilidad de requisitos

| REQ | Componente | Test | Deploy |
|-----|-----------|------|--------|
| REQ-001 Node.js ≥ 20 | Toolchain | TEST-001 | `.github/workflows/ci.yml` (node-version: 22) |
| REQ-002 Supabase configurado | `src/shared/lib/supabase` | TEST-001 | Env vars de Vercel |
| REQ-003 Upstash configurado | `src/shared/lib/ratelimit.ts` | TEST-001 | Env vars de Vercel |
| REQ-004 OpenRouter key | `src/server/ai/ai-router.ts` | TEST-001 | Env vars de Vercel |
| REQ-005 Migraciones aplicadas | `drizzle/` (0017, 0018) | TEST-001 | `pnpm db:push` en deploy |

---

## Validación cruzada (inconsistencias resueltas)

- **Modelos gratuitos de OpenRouter**: la tabla §3.2 (gemini-2.0-flash-exp, deepseek-chat, llama-4-maverick, mistral-7b, nemotron, qwen2.5, gemma-4) coincide con el pool configurado en `src/server/ai/ai-router.ts` [VERIFIED].
- **Variables de entorno**: las obligatorias documentadas en §7 coinciden con las requeridas por `src/shared/config/env.ts` [VERIFIED].
- **Tablas de la BD**: el listado de 22 tablas en §1.4 corresponde a la salida real de `drizzle-kit push` [VERIFIED].

---

## Unknowns y supuestos

- [ASSUMPTION] Los límites gratuitos de los servicios (OpenRouter 50 req/día, Supabase ~2 emails/hora) pueden cambiar sin previo aviso por política de cada proveedor.
- [UNKNOWN] El tiempo exacto de propagación de un dominio personalizado no está garantizado (5–30 min típico).
- [VERIFIED] SCAUDIT funciona sin `OPENROUTER_API_KEY`: los endpoints de IA degradan a respuestas de fallback en texto plano.

---

## Glosario

| Término | Definición |
|---------|-----------|
| RLS | Row Level Security de Supabase: restringe filas por usuario |
| Pooler | Proxy de conexión de Supabase (puerto 6543) para serverless |
| `:free` | Sufijo de modelos gratuitos de OpenRouter |
| Magic Link | Login sin contraseña vía link enviado por email |
| VAPID | Par de claves para Web Push notifications |

---

{: .tip }
**¿Todo funcionando?** El siguiente paso es crear tu primer proyecto y ejecutar un escaneo de inteligencia. Ve al dashboard, haz clic en **Nuevo Proyecto**, ingresa un dominio, y selecciona **Escanear Infraestructura Cibernética**.

{: .note }
**¿Encontraste un error en esta guía?** Abre un issue en [GitHub](https://github.com/StrategicConnex/StrategicConnexAudit/issues) o envía un PR con la corrección.
