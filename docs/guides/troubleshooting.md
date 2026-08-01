---
layout: default
title: Solución de Problemas
nav_order: 11
permalink: /docs/guides/troubleshooting
version: 1.1
fecha: 2026-08-01
autor: Equipo SCAUDIT
estado: Aprobado
---

# Guía de Solución de Problemas — StrategicAudit Pro (SCAUDIT)

{: .no_toc }

<details open markdown="block">
  <summary>Tabla de contenidos</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

---

Esta guía cubre los errores más comunes al instalar, ejecutar y desplegar SCAUDIT, con soluciones paso a paso.

---

## 1. Errores de instalación

### Error: `pnpm install` falla con dependencias nativas

```
Error: The module '@rollup/rollup-win32-x64-msvc' was not found
```

**Causa:** Falta el binding nativo de Rolldown para tu plataforma.

**Solución:**
```bash
# Instalar el binding correspondiente
pnpm add @rolldown/binding-win32-x64-msvc -D
```

Si estás en macOS:
```bash
pnpm add @rolldown/binding-darwin-x64 -D
```

### Error: `pnpm install` — node_modules corrupto

```
Error: ENOENT: no such file or directory, open '.../node_modules/.pnpm/...'
```

**Solución:**
```bash
# Limpiar caché y reinstalar
rm -rf node_modules .pnpm-store
pnpm store prune
pnpm install
```

### Error: Versión de Node.js incorrecta

```
Error: You are using Node.js 18.x.x. Expected >= 20.
```

**Solución:** El proyecto requiere Node.js >= 20.

```bash
# Verificar versión actual
node --version

# Usar nvm (recomendado)
nvm install 20
nvm use 20

# O usar fnm
fnm install 20
fnm use 20
```

### Error: `sharp` no se compila

```
Error: sharp: Could not load the sharp module. Please install it.
```

**Solución:**
```bash
# En Windows (puede necesitar build tools)
pnpm add sharp --ignore-scripts
npx sharp-cli --version

# En macOS/Linux, reinstalar
pnpm rebuild sharp
```

---

## 2. Errores de base de datos (Supabase)

### Error: `DIRECT_URL is missing`

```
Error: La variable de entorno DIRECT_URL falta en la configuración de drizzle
```

**Causa:** `.env.local` no existe o no contiene `DIRECT_URL`.

**Solución:**
```bash
# Copiar template
cp .env.example .env.local

# Editar DIRECT_URL con la URL de Supabase (puerto :5432)
# DIRECT_URL=postgresql://postgres:password@db.xxxxx.supabase.co:5432/postgres
```

### Error: `password authentication failed`

```
Error: password authentication failed for user "postgres"
```

**Causas posibles y soluciones:**

| Causa | Solución |
|-------|----------|
| Contraseña incorrecta | Verifica la contraseña en Supabase → Project Settings → Database |
| Caracteres especiales en la contraseña | URL-encode: `@` → `%40`, `#` → `%23`, `$` → `%24` |
| Proyecto de Supabase pausado | Entra al dashboard de Supabase para reactivarlo |

```bash
# Verificar conectividad
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" | head -c 100
```

### Error: `relation "xxx" does not exist`

```
Error: relation "projects" does not exist
```

**Causa:** Las migraciones no se ejecutaron.

**Solución:**
```bash
pnpm db:push
```

Si sigue fallando:
```bash
# Verificar que las tablas existen
pnpm test-db

# Si no hay tablas, forzar push
pnpm db:push --force
```

### Error: `connect ECONNREFUSED`

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Causa:** El proyecto de Supabase está pausado o la URL es incorrecta.

**Soluciones:**
1. **Proyecto pausado:** Ve a [Supabase Dashboard](https://supabase.com/dashboard/projects) y haz clic en **Restore**
2. **URL incorrecta:** Verifica que `DATABASE_URL` use el pooler (`:6543`) y `DIRECT_URL` use directa (`:5432`)
3. **Firewall:** Si estás en una red corporativa, prueba desde otra red

### Error: `SSL connection` / `self-signed certificate`

```
Error: SSL error: self-signed certificate in certificate chain
```

**Solución:** Agrega `DB_ALLOW_INSECURE_SSL=true` a `.env.local` (solo para desarrollo):

```env
DB_ALLOW_INSECURE_SSL=true
```

En producción, esto no debería ocurrir porque Vercel usa conexiones SSL estándar.

---

## 3. Errores de autenticación (Supabase Auth)

### Error: `Failed to fetch` al enviar Magic Link

```
TypeError: Failed to fetch
```

**Causas posibles y soluciones:**

| Causa | Síntoma | Solución |
|-------|---------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` incorrecto | Error en consola del navegador | Verifica que la URL termina en `.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` incorrecto | 401 en network tab | Verifica que es la anon key, no la service_role key |
| Site URL no configurada | Error 400 de Supabase | Configura en Supabase → Auth → Settings |
| CSP bloquea conexión | Error en consola del navegador | Verifica que `*.supabase.co` está en `connect-src` |

```bash
# Verificar desde terminal
curl -s -X POST "https://${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### Error: `Site URL mismatch` en callback

```
Error: Auth callback failed: Site URL mismatch
```

**Causa:** La URL de callback no está en la lista de Redirect URLs de Supabase.

**Solución:**
1. Ve a Supabase → Authentication → Settings
2. En **Redirect URLs**, agrega:
   - `http://localhost:3000/**` (desarrollo)
   - `https://strategicaudit-pro.vercel.app/**` (producción)
3. Guarda y espera 1 minuto antes de reintentar

### Error: Magic Link no llega al correo

**Causas posibles:**

1. **El email está baneado:** Si intentaste muchas veces, Supabase puede haber baneado temporalmente el email (espera 1 hora)
2. **El correo fue a spam:** Revisa la carpeta de spam
3. **Supabase no puede enviar emails:** En el plan gratuito, Supabase tiene un límite de ~2 emails/hora

**Soluciones:**
```bash
# Verificar el rate limit de Supabase Auth
# Revisar Supabase Dashboard → Auth → Logs
```

### Error: `Email rate limit exceeded`

```
Error: Email rate limit exceeded. Please try again later.
```

**Causa:** Superaste el límite de intentos de Magic Link.

**Solución:** Espera 60 segundos antes de reintentar. El rate limit de SCAUDIT es **40 intentos por IP cada 60 segundos** en validate-email.

---

## 4. Errores de Redis (Upstash)

### Error: `UPSTASH_REDIS_REST_URL not configured`

```
Error: Rate limiting deshabilitado — UPSTASH_REDIS_REST_URL no está configurado
```

**Solución:**
```bash
# Agregar URL y token de Upstash
UPSTASH_REDIS_REST_URL=https://useful-llama-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXNkAAIjcDE0NTY3ODkw...
```

### Error: Redis connection timeout

```
Error: connect ETIMEDOUT
```

**Causas posibles:**
1. **Proyecto pausado:** Upstash pausa bases de datos inactivas después de 7 días. Ve al dashboard y reactívala
2. **DB eliminada (DNS `Non-existent domain`):** si el subdominio `<animal>-<numero>.upstash.io` ya no resuelve, la base fue borrada — sigue la [Guía de Recuperación de Upstash Redis](/docs/guides/upstash-redis-recovery)
3. **Region mismatch:** Si elegiste `us-east` pero tu servidor está en `eu-west`, puede haber latencia
4. **Global Database:** Si usas plan gratuito, no habilites Global (requiere plan pro)

**Solución:**
```bash
# Verificar conectividad
curl -s -X GET "$UPSTASH_REDIS_REST_URL/ping" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN"
# → {"result":"PONG"}
```

{: .note }
**Diagnóstico rápido:** `npx tsx scripts/verify-upstash.mjs` verifica PING, SET/GET, INCR, TTL y limpieza — distingue DB muerta de latencia. Si la DB fue eliminada, usa `scripts/apply-upstash-env.mjs` para rotar las credenciales en `.env.local`, `.env.test` y Vercel en un solo paso.

---

## 5. Errores de IA / OpenRouter

### Error: `OPENROUTER_API_KEY is not configured`

```
Error: OPENROUTER_API_KEY is not configured. Configure it for AI features.
```

**Solución:**
```bash
# Agregar en .env.local
OPENROUTER_API_KEY=sk-or-v1-a1b2c3d4...
```

SCAUDIT funciona **sin API key** — los endpoints de IA devuelven respuestas de fallback en texto plano. Pero las funcionalidades de AI Copilot, Incident Brief y Reportes SEO no estarán disponibles.

### Error: AI model rate limited

```
Error: 429 — Too many requests for model "google/gemini-2.0-flash-exp:free"
```

**Causa:** OpenRouter limita los modelos gratuitos a 50 req/día (sin pago).

**Solución:**
1. Espera al día siguiente
2. Recarga $10+ en OpenRouter para aumentar el límite a 1,000 req/día

### Error: AI response empty or malformed

```
Error: AI API error: 502 — Model temporarily unavailable
```

**Causa:** El modelo gratuito puede estar caído o sobrecargado.

**Solución:** El sistema automáticamente hace fallback al siguiente modelo en el pool:

```
Orden de fallback:
1. Gemini 2.0 Flash (free)
2. DeepSeek V3 (free) ← Si Gemini falla
3. Llama 4 Maverick (free) ← Si DeepSeek falla
4. Mistral 7B (free) ← Si Llama falla
5. Qwen 2.5 72B (free) ← Si Mistral falla
6. Gemma 4 (free) ← Último recurso
```

### Error: `Unauthorized` en requests a OpenRouter

```
Error: 401 — Unauthorized
```

**Causa:** La API Key es inválida o fue revocada.

**Solución:**
```bash
# Verificar que la key funciona
curl -s https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"google/gemini-2.0-flash-exp:free","messages":[{"role":"user","content":"ping"}],"max_tokens":5}'
```

---

## 6. Errores del servidor de desarrollo

### Error: `The "middleware" file convention is deprecated`

```
Error: The "middleware" file convention is deprecated. Please use "proxy" instead.
```

**Causa:** Next.js 16 reemplazó `middleware.ts` por `proxy.ts`.

**Solución:**
```bash
# Si existe ambos archivos, eliminar middleware.ts
rm src/middleware.ts
```

### Error: `Both middleware and proxy files detected`

```
Error: Both middleware file "./src/middleware.ts" and proxy file
"./src/proxy.ts" are detected. Please use "./src/proxy.ts" only.
```

**Causa:** Migración incompleta de middleware a proxy.

**Solución:**
```bash
rm src/middleware.ts
# Si el error persiste, limpiar caché
rm -rf .next
pnpm dev
```

### Error: `eval() is not supported` en desarrollo

```
eval() is not supported in this environment.
React requires eval() in development mode.
```

**Causa:** La CSP de SCAUDIT bloquea `unsafe-eval`, pero React en modo desarrollo necesita `eval()` para callstacks.

**Solución (automática):** El proxy (`src/proxy.ts`) detecta `NODE_ENV=development` y agrega `'unsafe-eval'` automáticamente. Si el error persiste:

```bash
# Limpiar caché de Turbopack
rm -rf .next
pnpm dev
```

### Error: Puerto 3000 en uso

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solución:**
```bash
# En Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# En macOS/Linux
lsof -i :3000
kill -9 <PID>
```

### Error: Turbopack se cuelga o tarda mucho

```
[wait] compiling...
[wait] compiling... (5+ minutos)
```

**Causas posibles:**
1. **Muy pocos recursos:** Turbopack necesita al menos 4 GB de RAM libre. Cierra otras aplicaciones
2. **Caché corrupto:** Limpia `.next`
3. **Windows Defender:** Agrega la carpeta del proyecto a las exclusiones de Windows Defender

**Solución:**
```bash
rm -rf .next
pnpm dev
```

### Error: Hot Module Replacement (HMR) no funciona

Si editas un archivo y los cambios no se reflejan automáticamente:

**Soluciones:**
1. Guarda el archivo (Ctrl+S)
2. Refresca la página manualmente (F5)
3. Si sigue sin funcionar, reinicia el servidor
4. En casos extremos: `rm -rf .next && pnpm dev`

---

## 7. Errores de build

### Error: Build timeout en Vercel

```
Error: Command "pnpm build" exceeded the serverless build timeout of 45s
```

**Causa:** El plan Hobby de Vercel tiene un build timeout de 45 segundos.

**Soluciones:**
1. **Optimizar imports:** Usa `experimental.optimizePackageImports` en `next.config.ts`
2. **Separar chunks grandes:** Usa `next/dynamic` con `ssr: false`
3. **Actualizar a Pro:** Build timeout aumenta a 200s

### Error: TypeScript build errors

```
error TS2322: Type 'X' is not assignable to type 'Y'
```

**Soluciones comunes:**
```bash
# Ejecutar typecheck localmente para ver todos los errores
npx tsc --noEmit

# Si el error es por strict mode, puedes relajarlo temporalmente en tsconfig.json
# "strict": false
```

### Error: Module not found

```
Error: Module not found: Can't resolve '@/shared/lib/xxx'
```

**Causa:** El alias de importación `@/` no está configurado o el archivo no existe.

**Solución:**
```bash
# Verificar que el alias está configurado en tsconfig.json
# "paths": { "@/*": ["./src/*"] }

# Verificar que el archivo existe
ls -la src/shared/lib/xxx.ts
```

### Error: Bundle size exceeded (50 MB)

```
Error: The serverless function "api/intelligence" is 52 MB
```

**Solución:**
1. Revisa dependencias innecesarias en la función
2. Usa `import type` en vez de `import` para tipos
3. Divide rutas grandes en archivos más pequeños
4. Usa `next/dynamic` para componentes pesados

---

## 8. Errores del SIEM Exporter

### Error: Alertas no llegan a Slack

**Verificaciones:**
```bash
# 1. El webhook URL es correcto?
echo $SIEM_WEBHOOK_SLACK
# → https://hooks.slack.com/services/T00/B000/XXXXXXXXXX

# 2. Probar webhook manualmente
curl -s -X POST "$SIEM_WEBHOOK_SLACK" \
  -H "Content-Type: application/json" \
  -d '{"text":"🧪 Test desde SCAUDIT"}'
```

### Error: SIEM heartbeat no aparece

**Verificaciones:**
1. Ve a `/security/audit` y filtra por `heartbeat`
2. Revisa que Trigger.dev esté ejecutando el task `siem-exporter`
3. Verifica que `SIEM_WEBHOOK_SLACK` (o cualquier canal) está configurado

### Error: `logSecurityEvent` falla silenciosamente

**Causa:** La tabla `security_audit_logs` no existe o RLS la bloquea.

**Solución:**
```bash
# Ejecutar migración
pnpm db:push

# Verificar tabla
psql "$DIRECT_URL" -c "\dt security_audit_logs"
```

---

## 9. Errores del Engine de Inteligencia

### Error: `fetch failed` en escaneo de infraestructura

```
Error interno de ejecución diagnóstica: fetch failed
```

**Causas posibles:**
1. **El dominio no existe:** Verifica que el dominio esté correctamente escrito
2. **El servidor DNS no responde:** Problema temporal de red
3. **Timeout:** Algunas consultas WHOIS pueden tardar >10 segundos

**Solución:**
```bash
# Verificar que el dominio es accesible
ping example.com
nslookup example.com

# Reintentar el escaneo después de unos segundos
```

### Error: Rate limit excedido en escaneos

```
Error: Límite de solicitudes de IA excedido
```

**Causa:** Superaste el límite de 5 requests de AI/minuto por usuario.

**Solución:** Espera 60 segundos. Los rate limits se resetean automáticamente.

### Error: WHOIS no devuelve datos

```
Warning: WHOIS lookup returned empty result
```

**Causas:**
1. **WHOIS rate limited:** El servidor WHOIS del registrador bloqueó la consulta
2. **Dominio sin WHOIS público:** Algunos dominios `privacy` no exponen WHOIS
3. **TLD no soportado:** Algunos TLDs nuevos no tienen WHOIS público

**Solución:** No es un error crítico. El sistema continúa con las demás herramientas de escaneo.

---

## 10. Errores de React y Next.js

### Error: `Objects are not valid as a React child`

```
Error: Objects are not valid as a React child (found: object with keys {id, name})
```

**Causa:** Estás intentando renderizar un objeto directamente en JSX. React solo acepta strings, números y arrays.

**Solución:** Usa `JSON.stringify()` o accede a propiedades específicas:

```tsx
// ❌ Incorrecto
<div>{miObjeto}</div>

// ✅ Correcto
<div>{miObjeto.name}</div>
<div>{JSON.stringify(miObjeto)}</div>
```

### Error: `Hydration failed`

```
Error: Hydration failed because the initial UI does not match what was rendered on the server
```

**Causas:**
1. **Uso de `window` o `document` sin verificar:** Usa `typeof window !== 'undefined'` dentro de `useEffect`
2. **`Date.now()` o `Math.random()` durante el render:** Mueve estos valores a `useEffect` o `useState` con lazy initializer
3. **Diferencia en className SSR vs CSR:** Asegúrate de que las clases de Tailwind sean consistentes

**Solución:**
```tsx
// ✅ Correcto: valores dinámicos en useEffect
const [now, setNow] = useState(0);
useEffect(() => {
  setNow(Date.now());
}, []);
```

### Error: `setState sync in effect` (React 19 strict mode)

```
Error: Avoid calling setState() directly within an effect
```

**Causa:** React 19 advierte contra `setState()` sincrónico dentro de `useEffect` porque puede causar renders en cascada.

**Solución:** Si es una inicialización única (leer de localStorage), usa un lazy initializer:

```tsx
// ❌ Incorrecto
const [data, setData] = useState([]);
useEffect(() => {
  setData(JSON.parse(localStorage.getItem('key') || '[]'));
}, []);

// ✅ Correcto
const [data, setData] = useState(() => {
  return JSON.parse(localStorage.getItem('key') || '[]');
});
```

### Error: `Cannot access variable before it is declared` (hoisting issue)

```
Error: Cannot access 'functionName' before initialization
```

**Causa:** Usar una función declarada con `function` antes de su declaración, en un contexto donde React espera referencias estables.

**Solución:** Mueve las funciones arriba del `useEffect` que las usa, o usa `useCallback`:

```tsx
// ✅ Correcto: definir función antes de usarla
function handleData() { ... }

useEffect(() => {
  handleData();
}, []);
```

---

## 11. Errores de Playwright / Tests

### Error: Playwright no encuentra el browser

```
Error: browserType.launch: Executable doesn't exist at ...
```

**Solución:**
```bash
pnpm exec playwright install chromium
```

### Error: Tests fallan por timeouts

```
Error: Timeout 30000ms exceeded.
```

**Soluciones:**
1. Aumenta el timeout en `playwright.config.ts`
2. Verifica que el servidor de desarrollo está corriendo
3. Asegúrate de que no hay rate limiting bloqueando los requests

### Error: Vitest no encuentra tests

```
Error: No test files found matching patterns
```

**Solución:**
```bash
# Verificar pattern en vitest.config.ts
# Ejecutar con patrón explícito
pnpm vitest run src/shared/lib/ratelimit.test.ts
```

---

## 12. Errores de Trigger.dev

### Error: `TRIGGER_SECRET_KEY is missing`

```
Error: Trigger.dev secret key not configured
```

**Solución:**
```bash
# Agregar a .env.local
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxxxx

# Obtener de: Trigger.dev Dashboard → Settings → API Keys
```

### Error: Trigger task no se ejecuta

**Verificaciones:**
1. `trigger.config.ts` tiene el `project` ID correcto
2. `TRIGGER_SECRET_KEY` está configurada
3. Los tasks están en `src/trigger/`

```bash
# Desplegar tasks
npx trigger.dev deploy

# Ver logs en Trigger.dev Dashboard
```

### Error: Trigger.dev deploy timeout

```
Error: Deployment timed out after 120 seconds
```

**Solución:** Verifica que `trigger.config.ts` y los task files sean correctos. Si persiste, intenta desplegar desde la UI de Trigger.dev.

---

## 13. Errores de GitHub Actions / CI

### Error: CI pipeline falla en lint

```
Error: ESLint found too many warnings (threshold: 0)
```

**Solución:**
```bash
# Ejecutar lint localmente
pnpm lint

# Auto-fix de problemas
pnpm eslint --fix src/
```

### Error: CI pipeline falla en tests

```
Error: 1 test failed
```

**Solución:**
```bash
# Ejecutar tests localmente
pnpm test

# Ver específicamente el test que falla
pnpm vitest run --reporter=verbose
```

### Error: Codecov upload falla

```
Error: Codecov token not found
```

**Solución:** Agrega `CODECOV_TOKEN` en GitHub → Settings → Secrets → Actions secrets.

---

## 14. Diagnóstico rápido

### Script de verificación de 5 segundos

```bash
#!/bin/bash
# Verifica servicios críticos

echo "═══ Diagnóstico rápido SCAUDIT ═══"

# 1. Node.js
echo "[1/5] Node.js: $(node -v)"

# 2. Variables de entorno
echo "[2/5] Supabase: $(if [ -n \"$NEXT_PUBLIC_SUPABASE_URL\" ]; then echo '✅'; else echo '❌'; fi)"
echo "[2/5] Upstash:   $(if [ -n \"$UPSTASH_REDIS_REST_URL\" ]; then echo '✅'; else echo '❌'; fi)"
echo "[2/5] OpenRouter:$(if [ -n \"$OPENROUTER_API_KEY\" ]; then echo '✅'; else echo '❌'; fi)"

# 3. Conexión Supabase
curl -s -o /dev/null -w "[3/5] Supabase API: HTTP %{http_code}\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"

# 4. Conexión Redis
curl -s -X GET "$UPSTASH_REDIS_REST_URL/ping" \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" | \
  grep -q "PONG" && echo "[4/5] Redis: ✅ PONG" || echo "[4/5] Redis: ❌"

# 5. Servidor local
curl -s -o /dev/null -w "[5/5] Dev server: HTTP %{http_code}\n" \
  http://localhost:3000/login 2>/dev/null || echo "[5/5] Dev server: ❌ no corriendo"
```

---

## Referencia rápida: Logs y debugging

| Componente | Dónde ver logs |
|------------|---------------|
| Servidor de desarrollo | Terminal donde corre `pnpm dev` |
| Vercel Production | Vercel Dashboard → Function Logs |
| Supabase Auth | Supabase Dashboard → Auth → Logs |
| Upstash Redis | Upstash Dashboard → Metrics |
| OpenRouter | OpenRouter Dashboard → Logs |
| Trigger.dev | Trigger.dev Dashboard → Runs |
| GitHub Actions | GitHub → Actions → workflow → job |
| SIEM Exporter | `/security/audit` en el dashboard |

---

{: .note }
**¿No encontraste tu error aquí?** Abre un issue en [GitHub](https://github.com/StrategicConnex/StrategicConnexAudit/issues) con el mensaje de error completo y los pasos para reproducirlo. Incluye:
1. Mensaje de error exacto
2. Versión de Node.js y sistema operativo
3. Archivo relevante (si aplica)
4. Pasos para reproducir

{: .tip }
**¿Quieres contribuir a esta guía?** Los PRs son bienvenidos. Agrega tu error + solución siguiendo el mismo formato de tabla.

---

## Alcance y objetivos

Esta guía documenta los errores más comunes al instalar, ejecutar y desplegar SCAUDIT Pro, con causa raíz, síntomas y soluciones verificadas. Alcance: errores de instalación, Supabase, autenticación, Upstash Redis, OpenRouter, dev server, build, SIEM, engine de inteligencia, React/Next.js, Playwright, Trigger.dev y CI. Objetivo: reducir el tiempo de resolución a menos de 10 minutos por escenario.

---

## Flujos de diagnóstico

### FLOW-001 — Diagnóstico de fallo de instalación

```mermaid
flowchart TD
  A[Error de instalación] --> B{Qué capa falla?}
  B -->|Dependencias| C[pnpm install / sharp / rolldown]
  B -->|Base de datos| D[DIRECT_URL / auth / ECONNREFUSED]
  B -->|Redis| E[ETIMEDOUT / DNS non-existent]
  B -->|IA| F[429 / 502 / Unauthorized]
  B -->|Dev server| G[puerto 3000 / Turbopack]
  B -->|Build| H[timeout 45s / bundle 50MB]
  C --> I[Ver sección 1]
  D --> J[Ver sección 2]
  E --> K[Ver sección 4 + upstash-redis-recovery]
  F --> L[Ver sección 5]
  G --> M[Ver sección 6]
  H --> N[Ver sección 7]
```

### FLOW-002 — Diagnóstico de rate limit excedido

```mermaid
flowchart LR
  A[429 Too Many Requests] --> B{Redis responde?}
  B -->|PONG| C[Límite real alcanzado: esperar 60s]
  B -->|HTTP 000 / DNS| D[DB eliminada: seguir upstash-redis-recovery]
```

---

## Operaciones y runbooks

**Monitoreo:** los logs de cada componente están tabulados en la sección "Referencia rápida" (Vercel Function Logs, Supabase Auth Logs, Upstash Metrics, OpenRouter Logs, Trigger.dev Runs, GitHub Actions).

**Runbook — diagnóstico rápido de 5 segundos:**

1. `node -v` → ≥ 20
2. Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `UPSTASH_REDIS_REST_URL`, `OPENROUTER_API_KEY` presentes
3. `curl` a Supabase `/rest/v1/` con anon key → HTTP 200
4. `curl` a Upstash `/ping` → `PONG`
5. `curl http://localhost:3000/login` → HTTP 200

Si el paso 4 falla con DNS non-existent, la DB fue eliminada — seguir la [Guía de Recuperación de Upstash Redis](/docs/guides/upstash-redis-recovery).

---

## Inventario visual

| ID | Tipo | Descripción | Audiencia | Nivel |
|----|------|-------------|-----------|-------|
| FLOW-001 | Flowchart | Diagnóstico por capa de fallo | Soporte/Ops | L2 |
| FLOW-002 | Flowchart | Diagnóstico de rate limit | Soporte/Ops | L2 |

---

## Trazabilidad de errores

| REQ | Componente | Test | Deploy |
|-----|-----------|------|--------|
| REQ-001 Node ≥ 20 | Toolchain | TEST-001 (instalación) | CI `node-version: 22` |
| REQ-002 Supabase configurado | `src/shared/lib/supabase` | `test-db` | Env vars Vercel |
| REQ-003 Redis configurado | `src/shared/lib/ratelimit.ts` | `verify-upstash.mjs` | Env vars Vercel |
| REQ-004 AI key | `src/server/ai/ai-router.ts` | Fallback resiliente | Env vars Vercel |

---

## Validación cruzada (inconsistencias resueltas)

- **Umbral de rate limit de email**: se documenta 20 req/60s en validate-email (tabla de límites) y 40 intentos/minuto en la sección de autenticación — corresponde al decorador `withRateLimit` del endpoint de auth, mientras que el rate limit anti-spam es de 20/60s [VERIFIED].
- **Diagnóstico Redis**: el error `ETIMEDOUT` (latencia) se distingue del DNS `Non-existent domain` (DB eliminada) — la guía dirige cada caso a su solución correcta [VERIFIED].

---

## Unknowns y supuestos

- [VERIFIED] SCAUDIT funciona sin `OPENROUTER_API_KEY` (fallback en texto plano).
- [ASSUMPTION] Los límites gratuitos de los proveedores pueden cambiar sin aviso.
- [UNKNOWN] El tiempo de propagación de cambios de DNS del dominio del cliente no es controlable.

---

## Glosario

| Término | Definición |
|---------|-----------|
| HMR | Hot Module Replacement |
| RLS | Row Level Security de Supabase |
| Turbopack | Bundler de Next.js 16 |
| EADDRINUSE | Puerto ya en uso |
| ECONNREFUSED | Conexión rechazada (servicio inactivo) |

---

## Versionado

| Campo | Valor |
|-------|-------|
| Versión | 1.1 |
| Fecha | 2026-08-01 |
| Autor | Equipo SCAUDIT |
| Estado | Aprobado |
