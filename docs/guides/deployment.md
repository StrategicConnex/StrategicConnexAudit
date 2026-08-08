---
layout: default
title: Despliegue en Vercel
nav_order: 10
permalink: /docs/guides/deployment
version: 2.2
fecha: 2026-08-08
autor: Equipo SCAUDIT
estado: Aprobado
---

# Guía de Despliegue — StrategicAudit Pro (SCAUDIT) en Vercel

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

Esta guía te lleva paso a paso desde el repositorio local hasta tener SCAUDIT corriendo en producción en **Vercel**, con todas las integraciones configuradas.

---

## Prerequisitos

Antes de empezar, asegúrate de tener:

- [ ] Repositorio en GitHub con el código de SCAUDIT
- [ ] Cuenta en [Vercel](https://vercel.com) (plan Hobby gratuito)
- [ ] Proyecto de [Supabase](https://supabase.com) configurado (ver [guía de instalación](../installation.md))
- [ ] Base de datos [Upstash Redis](https://upstash.com) creada
- [ ] API Key de [OpenRouter](https://openrouter.ai/keys)
- [ ] (Opcional) Cuenta en [Trigger.dev](https://trigger.dev) para background jobs

---

## 1. Conectar repositorio a Vercel

### 1.1 Importar proyecto

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Inicia sesión con GitHub (recomendado)

```
┌─────────────────────────────────────────────────────────┐
│  Import Git Repository                                   │
│                                                         │
│  ○ GitHub    ○ GitLab    ○ Bitbucket                    │
│                                                         │
│  [strategicconnex/strategicaudit-pro             ▼]     │
│                                                         │
│  [Import]  ← Haz clic aquí                              │
└─────────────────────────────────────────────────────────┘
```

3. Selecciona el repositorio `StrategicConnex/StrategicConnexAudit` (o el tuyo)
4. Vercel detectará automáticamente **Next.js** como framework

### 1.2 Configurar build

Vercel leerá la configuración de `vercel.json` y `next.config.ts` automáticamente. Verifica que estos valores sean correctos:

```
┌─────────────────────────────────────────────────────────┐
│  Configure Project                                      │
│                                                         │
│  Framework Preset:  Next.js          ✓ detectado        │
│  Root Directory:    ./               ○                   │
│  Build Command:     pnpm build       ✓ desde vercel.json │
│  Output Dir:        .next            ✓ desde vercel.json │
│  Install Command:   pnpm install     ✓ desde vercel.json │
│                                                         │
│  [Deploy]  ← Aún no. Primero las variables de entorno   │
└─────────────────────────────────────────────────────────┘
```

{: .warning }
No hagas clic en **Deploy** todavía. Primero configura las variables de entorno (abajo). Si deployas sin las variables, el build fallará o la app arrancará sin base de datos.

---

## 2. Configurar variables de entorno

### 2.1 Agregar variables en Vercel Dashboard

En la pantalla de configuración del proyecto, expande la sección **Environment Variables** y agrega:

#### Variables obligatorias

| Variable | Cómo obtenerla |
|----------|----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API → Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key |
| `DATABASE_URL` | Supabase → Database → Connection string (pooler :6543) |
| `DIRECT_URL` | Supabase → Database → Connection string (direct :5432) |
| `UPSTASH_REDIS_REST_URL` | Upstash → Database → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash → Database → REST Token |
| `CRON_SECRET` | Genérala con `openssl rand -hex 32` |

#### Variables recomendadas

| Variable | Propósito |
|----------|-----------|
| `OPENROUTER_API_KEY` | Habilita modelos de IA |
| `TRIGGER_SECRET_KEY` | Background jobs (Trigger.dev) |
| `VAPID_PUBLIC_KEY` | Push notifications |
| `VAPID_PRIVATE_KEY` | Push notifications |
| `SIEM_WEBHOOK_SLACK` | Alertas de seguridad a Slack |
| `SIEM_WEBHOOK_PAGERDUTY` | Alertas a PagerDuty |
| `SIEM_WEBHOOK_SPLUNK` | Alertas a Splunk |
| `SIEM_PAGERDUTY_ROUTING_KEY` | Routing key de PagerDuty |
| `RESEND_API_KEY` | Email alerts |
| `SIEM_EMAIL_FROM` | Remitente de alertas email |
| `SIEM_EMAIL_TO` | Destinatario de alertas email |
| `AUTH_EMAIL_ALLOWLIST` | Emails que saltean el rate limit del login (comma-separated; el del owner ya está por defecto) |

```
┌─────────────────────────────────────────────────────────┐
│  Environment Variables                                  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ NEXT_PUBLIC_SUPABASE_URL    https://xxx.supabase  │   │
│  │     ○ Development  ● Production  ○ Preview        │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ DATABASE_URL    postgresql://postgres:...@xxx:p   │   │
│  │     ○ Development  ● Production  ○ Preview        │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ UPSTASH_REDIS_REST_URL   https://xxx.upstash.io   │   │
│  │     ○ Development  ● Production  ○ Preview        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  [Add] +                                     [Deploy]   │
└─────────────────────────────────────────────────────────┘
```

{: .tip }
**¿Misma variable en todos los entornos?** Marca **Development + Production + Preview** para cada variable. Así tu preview branch también funciona. La excepción es `NEXT_PUBLIC_DEV_BYPASS_AUTH` — esa **nunca** debe ir en Production.

{: .danger }
**No incluyas `NEXT_PUBLIC_DEV_BYPASS_AUTH=true` en las variables de Vercel.** Aunque el código tiene un guard que lo desactiva en producción, es una mala práctica. Esta variable solo debe usarse en `.env.local` de desarrollo.

### 2.2 Método alternativo: Vercel CLI

Si prefieres la terminal:

```bash
# Instalar Vercel CLI
pnpm add -g vercel

# Vincular proyecto local
vercel link

# Agregar variables (una por una)
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add DATABASE_URL
vercel env add UPSTASH_REDIS_REST_URL
# ...

# Ver variables configuradas
vercel env ls
```

### 2.3 Verificar que todo está configurado

```bash
vercel env ls
```

Resultado esperado (todas las variables deben aparecer):

```
> Environment Variables ⚙️

            Name                            Scope
  ─────────────────────────────────────────────────
  CRON_SECRET                     Production, Preview, Development
  DATABASE_URL                    Production, Preview, Development
  DIRECT_URL                      Production, Preview, Development
  NEXT_PUBLIC_SUPABASE_URL        Production, Preview, Development
  OPENROUTER_API_KEY              Production, Preview, Development
  SUPABASE_SERVICE_ROLE_KEY       Production, Preview, Development
  UPSTASH_REDIS_REST_TOKEN        Production, Preview, Development
  UPSTASH_REDIS_REST_URL          Production, Preview, Development
```

---

## 3. Primer deploy

### 3.1 Hacer clic en Deploy

Una vez configuradas las variables, haz clic en **Deploy**. Vercel ejecutará:

```bash
# 1. Install
pnpm install --frozen-lockfile

# 2. Build
pnpm build

# 3. Deploy to Vercel Edge Network
```

### 3.2 Monitorear el build

La pantalla de deploy muestra logs en tiempo real:

```
[15:23:01] Cloning github.com/StrategicConnex/StrategicConnexAudit...
[15:23:05] Installing dependencies...
[15:23:30] ✓ Install completed
[15:23:31] Building...
[15:23:35] ✓ Linting...
[15:23:40] ✓ Build completed in 45s
[15:23:41] Deploying...
[15:23:45] ✓ Production: https://strategicaudit-pro.vercel.app [Deploy]
```

{: .tip }
**Build time esperado:** 45–90 segundos en el plan Hobby.

### 3.3 Verificar el deploy

```bash
# Health check
curl https://strategicaudit-pro.vercel.app/api/public/v1/health

# Respuesta esperada:
# {"status":"ok","version":"1.0.0","services":{"redisConfigured":true,"dbConfigured":true}}
```

---

## 4. Configurar Supabase Auth para producción

### 4.1 Agregar URL de producción en Supabase

1. Ve a [Supabase → Authentication → Settings](https://supabase.com/dashboard/project/_/auth/settings)
2. En **Site URL**, agrega tu dominio de producción:
   - Cambia: `http://localhost:3000` → `https://strategicaudit-pro.vercel.app`

```
┌─────────────────────────────────────────────────────────┐
│  Authentication Settings                                 │
│                                                         │
│  Site URL:     [https://strategicaudit-pro.vercel.app]  │
│                                                         │
│  Redirect URLs:                                         │
│  [http://localhost:3000/**                        ✓]    │
│  [https://strategicaudit-pro.vercel.app/**        ✓]    │
│  [Add URL]                                              │
│                                                         │
│  [Save]                                                  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Configurar template de Magic Link (opcional)

En **Authentication → Email Templates → Magic Link**, personaliza el asunto y contenido:

```
Asunto: Inicia sesión en SCAUDIT Pro
Contenido:
  <h2>Hola {{ .Email }}</h2>
  <p>Haz clic en el enlace para iniciar sesión:</p>
  <a href="{{ .SiteURL }}/auth/callback?code={{ .Token }}&next=/">
    Iniciar sesión
  </a>
```

---

## 5. Configurar dominio personalizado (opcional)

### 5.1 Agregar dominio en Vercel

1. Ve a tu proyecto en Vercel → **Settings → Domains**
2. Ingresa tu dominio: `scaudit.tudominio.com`
3. Sigue las instrucciones para configurar los DNS

```
┌─────────────────────────────────────────────────────────┐
│  Domains                                                │
│                                                         │
│  [scaudit.tudominio.com           ] [Add]              │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ scaudit.tudominio.com                             │   │
│  │ Type: CNAME                                      │   │
│  │ Name: scaudit                                    │   │
│  │ Value: cname.vercel-dns.com                      │   │
│  │ Status: ⏳ Verifying...                          │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 5.2 Actualizar Site URL en Supabase

Agrega también el dominio personalizado en Supabase → Authentication → Settings → Site URL:

```text
https://scaudit.tudominio.com
```

---

## 6. Deploys automáticos desde GitHub

Vercel se conecta automáticamente con GitHub. Cada push a `main` dispara un deploy automático a producción:

```bash
# Esto dispara un deploy automático
git push origin main
```

### Branches y Preview Deploys

Cada push a cualquier branch genera una **Preview URL** única:

```bash
git checkout -b feat/nueva-funcionalidad
git push origin feat/nueva-funcionalidad
# → Vercel genera: https://strategicaudit-pro-git-feat-nueva.vercel.app
```

Las Preview Deploys tienen su propio conjunto de variables de entorno (puedes sobreescribir las de producción).

### Proteger producción

Para evitar deploys accidentales, puedes configurar **Git Protection** en Vercel:

1. **Settings → Git → Production Branch**: `main`
2. **Ignore Build Step**: `[ "$VERCEL_GIT_COMMIT_REF" != "main" ]`

---

## 7. Docs Quality Gate (CI)

El pipeline de CI incluye un job `docs-quality-gate` que valida la **documentación Enterprise** de las 8 carpetas técnicas (`docs/architecture/`, `docs/database/`, `docs/jobs/`, `docs/modules/`, `docs/traceability/`, `docs/risk/`, `docs/technical-debt/`, `docs/testing/`) contra el template obligatorio del [MASTER PROMPT v2](../improvements/MASTER_PROMPT-v2.md) (§4.1 — Quality Gate, 20 items × 5 pts = 100).

### Qué hace

Cada push/PR ejecuta `scripts/quality-gate.mjs` sobre **todos** los `*.md` de esas carpetas con un umbral de **80/100** (el estándar "no entregar" del MASTER PROMPT v2) y **falla el build** si algún TDD baja de ese puntaje. Los **JOB-CONTRACT de `docs/jobs/`** son contratos de Trigger.dev con requisitos más estrictos y exigen **90/100** vía `--min-dir`:

```bash
# Equivalente local al step de CI
set -e
shopt -s nullglob
DIRS="docs/architecture docs/database docs/jobs docs/modules docs/traceability docs/risk docs/technical-debt docs/testing"
for d in $DIRS; do
  for f in "$d"/*.md; do
    node scripts/quality-gate.mjs "$f" --min 80 --min-dir docs/jobs=90 --quiet
  done
done
```

#### Carpetas validadas y excepciones

| Carpeta | Qué contiene | Umbral |
|---------|--------------|--------|
| `docs/architecture/` | TDDs de arquitectura (`AI-ROUTER-TDD`, `ENTERPRISE-ARCHITECTURE`, `PIPELINE-HISTORY`, …) | 80 |
| `docs/database/` | TDDs y engines de base de datos | 80 |
| `docs/jobs/` | **JOB-CONTRACT** de Trigger.dev (12) | **90** (estricto) |
| `docs/modules/` | Module Contracts (10) | 80 |
| `docs/traceability/` | Matriz de trazabilidad | 80 |
| `docs/risk/` | Risk register | 80 |
| `docs/technical-debt/` | Registro de deuda técnica | 80 |
| `docs/testing/` | Matriz de cobertura de testing | 80 |

**Exclusiones deliberadas:** `docs/superpowers/` (MASTER-INDEX y los planes de gobernanza) **no** se valida — son índices/planes de trabajo, no TDDs técnicos, y no siguen el template de 20 checks. Lo mismo aplica al resto de `docs/` que no esté en la lista (guías, mejoras, security): el job solo cubre las 8 carpetas técnicas.

#### Comportamiento `nullglob`

El job usa `shopt -s nullglob` antes de los loops. Efecto: si una carpeta **no contiene ningún `.md` commiteado** en el checkout de CI (p.ej. porque los docs de `docs/jobs/` todavía no se commiteaban), el glob `"$d"/*.md` se expande a **vacío** en vez de pasarse como literal `docs/jobs/*.md` — la carpeta se omite sin fallar el job. Esto hace que el pipeline sea tolerante a carpetas vacías o aún sin commitear: el job valida **lo que existe en el checkout** y, cuando se commitean los docs, los incluye automáticamente sin cambiar el workflow.

> El job `docs-quality-gate` corre en **paralelo** a lint/build/tests y **no requiere `pnpm install`** — el validador es un script Node puro (zero-deps), por lo que solo necesita `actions/checkout` + `actions/setup-node`.

{: .note }
**Estado actual (ago 2026):** los TDDs técnicos de las 8 carpetas validan **39/39 PASS** — los 6 de `docs/architecture/` y los 12 JOB-CONTRACT de `docs/jobs/` puntúan **100/100** (los contratos pasan el umbral estricto de 90) y el resto cumple ≥ 80. Si un futuro PR agrega un TDD nuevo o degrada uno existente, el job `docs-quality-gate` lo marcará en rojo (usá el checklist del [QUALITY_GATE_REPORT](../improvements/quality-gate-report) para cerrar las secciones que faltan).

### Cómo correrlo localmente

```bash
# Un solo documento (exit 0 = PASS, exit 1 = FAIL)
node scripts/quality-gate.mjs docs/architecture/AI-ROUTER-TDD.md --min 80

# Un JOB-CONTRACT (exige 90 con --min-dir docs/jobs=90)
node scripts/quality-gate.mjs docs/jobs/JOB-CONTRACT-siem-exporter.md --min 80 --min-dir docs/jobs=90 --quiet

# Tabla de scores por carpeta con promedio (igual que el PR summary de CI)
node scripts/quality-gate.mjs --table docs/architecture docs/database docs/jobs docs/modules docs/traceability docs/risk docs/technical-debt docs/testing --min 80 --min-dir docs/jobs=90

# Todos los TDDs técnicos (mismo loop que CI, exit != 0 si alguno falla)
set -e; shopt -s nullglob
for d in docs/architecture docs/database docs/jobs docs/modules docs/traceability docs/risk docs/technical-debt docs/testing; do
  for f in "$d"/*.md; do
    node scripts/quality-gate.mjs "$f" --min 80 --min-dir docs/jobs=90 --quiet
  done
done

# Reporte global de todos los docs de docs/ (publica QUALITY_GATE_REPORT.md)
node scripts/quality-gate-report.mjs
```

### Pre-commit hook local (git)

Además del gate en CI, el repo incluye un **pre-commit hook local** (`.githooks/pre-commit`) que corre el mismo validador con `--min 80` sobre `docs/architecture/*.md` **antes de cada commit**, para que ningún TDD baje del umbral sin detectarse.

**Instalación automática**: el script `prepare` de `package.json` ejecuta `git config core.hooksPath .githooks` en cada `pnpm install`, así que el hook se activa solo al instalar dependencias. Para activarlo manualmente en un clon existente:

```bash
git config core.hooksPath .githooks
```

**Comportamiento**:

- Solo corre cuando el commit incluye archivos staged de `docs/architecture/` o cambios en el propio validador (`scripts/quality-gate.mjs`) — si no hay cambios relevantes, no bloquea nada.
- Si algún TDD puntúa < 80, el commit se **bloquea** con el detalle de qué documento falló (salida del validador con los checks pendientes).
- El hook valida el **working tree** (los archivos en disco). Si el contenido staged difiere del working tree, la red de seguridad final sigue siendo el job `docs-quality-gate` de CI, que valida la versión commiteada.
- Si `node` o `scripts/quality-gate.mjs` faltan, el hook **no bloquea** (degradación graciosa — CI sigue siendo la red de seguridad).

```bash
# Bypass de emergencia (solo si es intencional y vas a arreglarlo enseguida)
git commit --no-verify
```

### Cambiar el umbral o el alcance

| Cambio | Dónde |
|--------|-------|
| Umbral (p.ej. 85) | `.github/workflows/ci.yml` → job `docs-quality-gate` → reemplazar `--min 80` por `--min 85` (y `.githooks/pre-commit` si querés que el hook local use el mismo) |
| Umbral por carpeta (p.ej. `docs/jobs` a 90) | Mismo job → añadir `--min-dir <dir>=<N>` (repetible) a la invocación; el validador usa el **máximo** entre `--min` y los `--min-dir` cuyo directorio sea prefijo de la ruta |
| Alcance (p.ej. `docs/**/*.md`) | Mismo job → cambiar el glob del `for f in ...` (y el `grep` del hook local) |
| Umbral por defecto del validador | `scripts/quality-gate.mjs` → `let min = 80` (default cuando no se pasa `--min`) — ya coincide con el umbral de CI |

{: .tip }
**¿Tu PR falla por el quality gate?** El job imprime en los logs (y en el PR summary) cada documento con su score y las secciones faltantes (`- [ ] 01. Scope y objetivos...`). Cierra esas secciones en el documento y vuelve a pushear — el reporte completo con el checklist por doc está en [QUALITY_GATE_REPORT](../improvements/quality-gate-report).

---

## 8. Cron Jobs en Vercel

Los cron jobs se configuran en `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/siem", "schedule": "*/5 * * * *" },
    { "path": "/api/cron/uptime", "schedule": "*/15 * * * *" }
  ]
}
```

### Cron jobs disponibles

| Ruta | Schedule | Propósito |
|------|----------|-----------|
| `/api/cron/uptime` | `*/15 * * * *` (cada 15 min) | Verificación de uptime |
| `/api/cron/siem` | `*/5 * * * *` (cada 5min) | SIEM Exporter |
| `/api/ai/healthcheck` | `0 */6 * * *` (cada 6h) | Health check de modelos IA |

### Probar un cron manualmente

```bash
curl -X POST https://strategicaudit-pro.vercel.app/api/cron/uptime \
  -H "x-cron-secret: ${CRON_SECRET}"
```

### Límites del plan Hobby

| Recurso | Límite |
|---------|--------|
| Cron jobs | 2 por proyecto |
| Execution window | Cada 1 minuto como mínimo |
| Timeout | 60 segundos por ejecución |
| Logs | Últimos 50 logs |

{: .note }
Si necesitas más de 2 cron jobs o ventanas más cortas, considera usar **Trigger.dev** en vez de los cron nativos de Vercel.

---

## 9. Serverless Functions: Límites y consideraciones

### Timeouts

| Tipo | Límite Hobby | Límite Pro |
|------|-------------|------------|
| Serverless Function | 10s (basic) | 60s (Pro) / 900s (Enterprise) |
| Cron Job | 60s | 60s |
| Edge Function | 30s | 30s |

### Bundle size

| Recurso | Límite |
|---------|--------|
| Serverless Function | 50 MB (comprimido) |
| Edge Function | 4 MB (comprimido) |

### Buenas prácticas para Vercel

1. **Mantén las funciones pequeñas**: Cada ruta API debe importar solo lo necesario
2. **Evita dependencias pesadas**: `swagger-ui-react` (~3 MB) se carga con `next/dynamic` + `ssr: false`
3. **Usa Edge cuando sea posible**: Rate limiting y redirects funcionan mejor en Edge
4. **Cachea respuestas**: Usa `Cache-Control` headers donde tenga sentido
5. **Preferí ISR sobre SSR**: Generación estática con revalidación para contenido que no cambia frecuentemente

---

## 10. Post-deploy: Verificación

### Checklist

- [ ] `https://scaudit.vercel.app/login` carga correctamente
- [ ] El formulario de Magic Link acepta un email y redirige a Supabase
- [ ] `https://scaudit.vercel.app/api/public/v1/health` responde `200 OK`
- [ ] Los security headers están presentes (CSP, HSTS, X-Frame-Options)
- [ ] Las rutas de documentación funcionan (`/docs/`, `/docs/installation`)
- [ ] La API pública responde (`/api/public/v1/intelligence`)
- [ ] Swagger UI carga en `/swagger`

### Verificación con curl

```bash
# 1. Health check
curl -s https://strategicaudit-pro.vercel.app/api/public/v1/health

# 2. Security headers
curl -sI https://strategicaudit-pro.vercel.app/login | grep -i "content-security-policy\|strict-transport-security"

# 3. Rate limit headers
curl -sD - https://strategicaudit-pro.vercel.app/api/intelligence/health | grep -i "x-ratelimit"

# 4. Docs
curl -s -o /dev/null -w "%{http_code}" https://strategicaudit-pro.vercel.app/docs
# → 200
```

---

## 11. Rollback

Si un deploy falla o introduce un bug:

### Opción 1: Desde Vercel Dashboard

1. Ve a tu proyecto en Vercel → **Deployments**
2. Busca el último deploy exitoso
3. Haz clic en los **tres puntos (...)** → **Promote to Production**

### Opción 2: Desde CLI

```bash
# Listar deploys
vercel list

# Promover un deploy específico
vercel promote <deploy-url>
```

### Opción 3: Git revert

```bash
# Revertir el último commit
git revert HEAD
git push origin main
# → Vercel despliega automáticamente la versión revertida
```

---

## 12. Troubleshooting de deploys

### Error: Build timeout

```
Error: Command "pnpm build" exceeded the serverless build timeout of 45s
```

**Solución:** El plan Hobby tiene límite de 45s para build. Si el proyecto es grande:

1. Optimiza imports (`experimental.optimizePackageImports` en `next.config.ts`)
2. Separa chunks grandes con `next/dynamic`
3. Considera actualizar a plan Pro (200s de build timeout)

### Error: Function size exceeded

```
Error: The serverless function "api/intelligence" is 52 MB, which exceeds the 50 MB limit
```

**Solución:**

1. Revisa qué dependencias está incluyendo la función
2. Usa `import type` en vez de `import` para tipos
3. Divide rutas grandes en archivos más pequeños

### Error: Environment variable not found

```
Error: La variable de entorno DIRECT_URL falta en la configuración de drizzle
```

**Solución:**

1. Ve a Vercel Dashboard → Settings → Environment Variables
2. Verifica que `DIRECT_URL` está configurada para el entorno correcto (Production)
3. Redeployea después de agregarla

### Error: 500 Internal Server Error (serverless function crash)

```
Error: {
  "error": "Internal Server Error",
  "message": "Cannot read properties of undefined (reading 'from')"
}
```

**Solución:**

1. Revisa los **Function Logs** en Vercel Dashboard
2. Busca el error específico en el log
3. Common cause: variable de entorno faltante o mal formateada

---

## 13. Monitoreo post-deploy

### Vercel Analytics (gratuito)

1. Ve a tu proyecto en Vercel → **Analytics**
2. Activa **Web Analytics** (gratis, sin límite de datos)
3. Ve **Speed Insights** para Core Web Vitals

### Logs

```bash
# Ver logs en tiempo real (Vercel CLI)
vercel logs

# Filtrar por tipo
vercel logs --status fail
vercel logs --limit 50
```

### Alertas de deploy

En Vercel → **Settings → Notifications**, configura notificaciones para:

- **Deploy failed**: Recibir email/ Slack cuando un deploy falla
- **Deploy ready**: Saber cuándo está disponible la nueva versión

---

## 14. Preguntas frecuentes

### ¿Vercel es gratuito para SCAUDIT?

El plan **Hobby** de Vercel es gratuito e incluye:

| Recurso | Límite Hobby |
|---------|-------------|
| Ancho de banda | 100 GB/mes |
| Tiempo de ejecución | 600 horas/mes |
| Serverless Functions | 100 GB-horas/mes |
| Deploys | Ilimitados |
| Dominio personalizado | Sí |
| SSL/HTTPS | Automático |

Para un equipo pequeño o uso personal, el plan Hobby es suficiente.

### ¿Puedo usar otro hosting (Railway, Fly.io, AWS)?

Técnicamente sí, pero **Vercel es el hosting recomendado** por varias razones:

1. **Integración nativa** con Next.js (deploys optimizados, Edge Functions, ISR)
2. **Preview Deploys** automáticos por PR
3. **Cron jobs** nativos
4. **Analytics** y Speed Insights integrados
5. **Edge Network** global (más de 100 locations)

Si necesitas migrar a otro hosting, el proyecto está construido con Next.js `standalone` output, lo que facilita el deploy en cualquier plataforma que soporte Node.js.

### ¿Cómo migro de un dominio a otro?

1. Agrega el nuevo dominio en Vercel → Settings → Domains
2. Agrega la nueva URL en Supabase → Authentication → Settings → Site URL
3. Actualiza las Redirect URLs en Supabase (agrega `https://nuevodominio.com/**`)
4. Espera a que los DNS se propaguen (5-30 minutos)
5. Verifica que el Magic Link funciona con el nuevo dominio
6. (Opcional) Una vez verificado, elimina el dominio anterior

---

## Resumen de archivos de configuración

| Archivo | Propósito |
|---------|-----------|
| `vercel.json` | Configuración de build, cron jobs, regions |
| `next.config.ts` | Configuración de Next.js (output standalone, images) |
| `.env.example` | Template de variables de entorno |
| `.github/workflows/ci.yml` | Pipeline CI/CD con lint, tests, coverage y **Docs Quality Gate** |
| `scripts/quality-gate.mjs` | Validador de documentación Enterprise (20 checks, 0–100) |
| `trigger.config.ts` | Configuración de Trigger.dev |

---

---

## 15. Modelo de datos desplegado

| Entidad | Tabla | Propósito | Fuente |
|---------|-------|-----------|--------|
| Proyecto | `projects` | Contexto multi-tenant | [VERIFIED] `src/shared/db/schemas` |
| Auditoría | `audits` | Ejecuciones de auditoría | [VERIFIED] `src/shared/db/schemas` |
| Investigación | `intelligence_investigations` | Objetivos de inteligencia | [VERIFIED] `src/shared/db/schemas` |
| Hallazgos | `intelligence_findings` | Resultados de herramientas | [VERIFIED] `src/shared/db/schemas` |
| History | `dns_history` / `whois_history` | Snapshots y diffs | [VERIFIED] `src/shared/db/schemas/history.ts` |

---

## 16. Flujos de deployment

### FLOW-001 — Pipeline de deploy en Vercel

```mermaid
flowchart LR
  A[Push a main] --> B[GitHub Actions CI]
  B --> C[lint-and-build]
  B --> D[test-and-coverage]
  B --> E[api-contract-test]
  B --> F[docs-quality-gate]
  A --> G[Vercel deploy automático]
  G --> H[Build pnpm]
  H --> I[Production scaudit.vercel.app]
```

### FLOW-002 — Rollback

```mermaid
flowchart LR
  A[Deploy fallido] --> B{Promover deploy anterior}
  B -->|Dashboard| C[Deployments → Promote to Production]
  B -->|CLI| D[vercel promote <deploy-url>]
  B -->|Git| E[git revert HEAD && push]
```

---

## 17. APIs involucradas en el deploy

| Método | Endpoint | Auth | Propósito |
|--------|----------|------|-----------|
| GET | `/api/public/v1/health` | Público | Verificación post-deploy |
| GET | `/api/monitoring` | Sesión | Estado de monitoreo |
| GET | `/api/intelligence/health` | Sesión | Health del engine |
| POST | `/api/cron/uptime` | `x-cron-secret` | Cron diario |

---

## 18. Testing del deployment

| Caso | Comando | Resultado |
|------|---------|-----------|
| Health check | `curl .../api/public/v1/health` | `{"status":"ok"}` |
| Security headers | `curl -sI /login | grep -i csp` | CSP presente |
| Rate limit headers | `curl -sD - /api/intelligence/health` | `x-ratelimit-*` |
| Docs | `curl -s -o /dev/null -w "%{http_code}" /docs` | `200` |
| Swagger | `curl .../swagger` | `200` |
| CI | GitHub Actions | Jobs verdes (o gate de docs esperado) |

---

## 19. Operaciones y monitoreo post-deploy

**Monitoreo:** Vercel Analytics (Web Analytics + Speed Insights), Function Logs, y alertas de deploy (Deploy failed / Deploy ready) en Settings → Notifications.

**Runbook — deploy fallido:**

1. Revisar el log del build en Vercel (los 4 errores más comunes están en §12)
2. Verificar variables de entorno en Settings → Environment Variables
3. Rollback: Promote to Production del deploy anterior (§11)
4. Abrir issue con el mensaje de error completo

---

## 20. Inventario visual

| ID | Tipo | Descripción | Audiencia | Nivel |
|----|------|-------------|-----------|-------|
| FLOW-001 | Flowchart | Pipeline CI/CD + deploy | DevOps | L2 |
| FLOW-002 | Flowchart | Opciones de rollback | DevOps | L2 |

---

## 21. Trazabilidad del deployment

| REQ | Componente | Test | Deploy |
|-----|-----------|------|--------|
| REQ-001 CI verde | `.github/workflows/ci.yml` | Jobs de CI | GitHub Actions |
| REQ-002 Build OK | `next.config.ts` + `vercel.json` | `pnpm build` | Vercel |
| REQ-003 Env vars | Settings → Environment Variables | §10 checklist | Vercel |
| REQ-004 Docs gate | `scripts/quality-gate.mjs` | `docs-quality-gate` job | CI |

---

## 22. Validación cruzada (inconsistencias resueltas)

- **Umbral del quality gate**: esta guía documentaba el gate con umbral 60 y la distinción de dos umbrales (CI 60 / local 80); el job `docs-quality-gate` ahora usa `--min 80` y el hook local `.githooks/pre-commit` el mismo. Actualizado y consistente [VERIFIED].
- **Health endpoint**: el checklist §10 y §17 usan `/api/public/v1/health` con la misma forma de respuesta (`status`, `services`) [VERIFIED].

---

## 23. Unknowns y supuestos

- [VERIFIED] Vercel hace deploy automático en cada push a `main` (Git Integration).
- [ASSUMPTION] El plan Hobby (45s build timeout, 2 crons) aplica salvo upgrade a Pro.
- [UNKNOWN] El tiempo exacto del build depende del estado de la red de Vercel en cada deploy.

---

## 24. Glosario

| Término | Definición |
|---------|-----------|
| ISR | Incremental Static Regeneration de Next.js |
| Promote | Promover un deploy anterior a producción |
| Preview Deploy | Deploy temporal por branch/PR con URL única |
| Speed Insights | Métricas Core Web Vitals de Vercel |
| Function Logs | Logs de las serverless functions en Vercel |

---

## 25. Versionado

| Campo | Valor |
|-------|-------|
| Versión | 2.1 |
| Fecha | 2026-08-01 |
| Autor | Equipo SCAUDIT |
| Estado | Aprobado |

---

{: .tip }
**¿El deploy fue exitoso?** El siguiente paso es verificar que el login con Magic Link funciona en producción, crear tu primer proyecto y ejecutar un escaneo de inteligencia.

{: .note }
**¿Encontraste un error en esta guía?** Abre un issue en [GitHub](https://github.com/StrategicConnex/StrategicConnexAudit/issues) o envía un PR con la corrección.
