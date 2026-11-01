> ⚠️ **[HISTÓRICO — ARCHIVADO 2026-11-01]** Plan de ejecución de mayo-2026 (biblioteca de prompts para la fase de construcción).
> Ejecutado entre 2026-06 y 2026-10; el progreso posterior queda registrado en `docs/CHANGELOG.md` y en el registro de deuda: `docs/technical-debt/TECH-DEBT-REGISTER.md` (TD-01…TD-29).
> Nota histórica: la estructura `strategicaudit-pro/src/modules/*` de este plan se descartó (TD-04); `supabase/migrations` quedó sustituido por `drizzle/`.
> Vigente: `docs/architecture/CURRENT-STATE.md` · Informe maestro: `docs/MASTER-REPORT-2026-11-01.md`.

---
# Plan de Acción Completo – StrategicAudit Pro
## Google Antigravity IDE + Windows 11 + Vercel + Supabase + Trigger.dev v3

**Fecha:** 2026-05-07  
**Versión:** 2.0  
**Duración estimada:** 8-10 semanas (equipo de 3 desarrolladores)

---

## Índice

1. [Prompt Maestro de Inicialización](#1-prompt-maestro-de-inicialización)
2. [Prompts para Migraciones de Base de Datos](#2-prompts-para-migraciones-de-base-de-datos)
3. [Prompts para Tests](#3-prompts-para-tests)
4. [Prompts para Módulos Core](#4-prompts-para-módulos-core)
5. [Prompts para Integraciones](#5-prompts-para-integraciones)
6. [Prompts para CI/CD y Despliegue](#6-prompts-para-cicd-y-despliegue)
7. [Checklist de Ejecución](#7-checklist-de-ejecución)
8. [Solución de Problemas Comunes](#8-solución-de-problemas-comunes)

---

## 1. Prompt Maestro de Inicialización

```
Actúa como un arquitecto de software senior especializado en Next.js 15, 
Supabase y Trigger.dev v3. Tu misión es crear el proyecto 
"StrategicAudit Pro" desde cero siguiendo este plan de implementación.

## CONTEXTO DEL ENTORNO
- IDE: Google Antigravity en Windows 11 (PowerShell 7 como terminal nativa)
- Stack: Next.js 15 (App Router) + Vercel + Supabase + Trigger.dev v3
- Gestor de paquetes: pnpm
- Node.js: v22
- ORM: Drizzle ORM
- Estilos: Tailwind CSS + shadcn/ui

## REGLAS CRÍTICAS PARA WINDOWS 11
1. TODOS los comandos de terminal deben usar sintaxis PowerShell 7 (pwsh)
2. NUNCA uses comandos Unix (ls, rm, cat) - usa Get-ChildItem, Remove-Item, Get-Content
3. Para rutas con espacios, usa comillas simples: 'ruta con espacios'
4. Procesos largos (servidores, watchers) deben ejecutarse en terminal separada manualmente
5. NUNCA ejecutes migraciones de base de datos durante el build de Vercel

## ESTRUCTURA DE CARPETAS REQUERIDA
Crea esta estructura en la raíz del proyecto:

strategicaudit-pro/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Grupo de rutas de autenticación
│   │   ├── (dashboard)/        # Grupo de rutas del dashboard
│   │   ├── api/                # API Routes y Route Handlers
│   │   └── layout.tsx          # Root layout
│   ├── modules/                # Módulos de dominio (DDD)
│   │   ├── audit/              # Auditoría SEO (crawl, análisis)
│   │   ├── performance/        # Core Web Vitals, Lighthouse
│   │   ├── keywords/           # Rank tracking, SERP
│   │   ├── backlinks/          # Análisis de backlinks
│   │   ├── competitors/        # Análisis de competencia
│   │   ├── reporting/          # Generación de reportes
│   │   ├── integrations/       # GSC, GA4, Bing
│   │   ├── cro/                # A/B testing, heatmaps
│   │   └── schema/             # Esquemas Zod compartidos
│   ├── shared/                 # Código compartido
│   │   ├── db/                 # Configuración Drizzle + esquemas
│   │   ├── lib/                # Utilidades (Supabase client, helpers)
│   │   ├── types/              # Tipos TypeScript globales
│   │   └── config/             # Configuración de entorno
│   └── trigger/                # Jobs de Trigger.dev v3
├── supabase/
│   └── migrations/             # Migraciones SQL
├── drizzle/                    # Output de Drizzle Kit
├── .github/
│   └── workflows/              # CI/CD GitHub Actions
├── public/                     # Assets estáticos
├── components.json             # Configuración shadcn/ui
├── drizzle.config.ts
├── trigger.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local
└── .env.local.example

## PASO 1: INICIALIZACIÓN DEL PROYECTO
Ejecuta estos comandos en secuencia (uno por uno, esperando confirmación):

1. Crear proyecto Next.js 15:
   pnpm create next-app@latest strategicaudit-pro --typescript --tailwind --app --eslint --src-dir --no-turbopack

2. Navegar al directorio:
   cd strategicaudit-pro

3. Instalar dependencias principales:
   pnpm add drizzle-orm @supabase/supabase-js @supabase/ssr @trigger.dev/sdk zod @tanstack/react-query @trigger.dev/build

4. Instalar dependencias de desarrollo:
   pnpm add -D drizzle-kit @types/node @types/react vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom playwright @playwright/test

5. Inicializar shadcn/ui:
   npx shadcn@latest init --yes --defaults

6. Inicializar Trigger.dev v3:
   npx trigger.dev@latest init

## PASO 2: CONFIGURACIÓN DE ARCHIVOS CLAVE

Genera estos archivos con su contenido completo y correcto:

### A) next.config.ts
- Configuración para Vercel con output standalone
- Headers de seguridad (CSP, HSTS)
- Configuración de imágenes desde dominios externos
- Variables de entorno públicas

### B) tsconfig.json
- Path aliases configurados: "@/*" → "./src/*"
- Strict mode activado
- Module resolution: bundler

### C) drizzle.config.ts
- Dialect: postgresql
- Schema path: ./src/shared/db/schemas/*.ts
- Output: ./drizzle
- Usar DIRECT_URL (puerto 5432) para migraciones

### D) trigger.config.ts
- Runtime: node
- Directorio de tasks: ./src/trigger
- Retries: 3 intentos con backoff exponencial
- Max duration: 3600 segundos (1 hora)
- Sincronización automática de variables de Vercel

### E) tailwind.config.ts
- Extender tema con colores de marca
- Configurar dark mode: class
- Añadir plugins de shadcn/ui

### F) src/shared/config/env.ts
- Validación de variables de entorno en build-time
- Función getEnvVar que lanza error si falta variable
- Exportar objeto env con: supabaseUrl, supabaseAnonKey, supabaseServiceKey, databaseUrl, directUrl, triggerSecretKey

### G) src/shared/lib/supabase/client.ts
- Cliente de navegador usando createBrowserClient
- Singleton pattern para reutilizar instancia

### H) src/shared/lib/supabase/server.ts
- Cliente de servidor usando createServerClient
- Manejo correcto de cookies en Next.js 15
- Función async createClient()

### I) src/shared/lib/supabase/admin.ts
- Cliente admin usando service_role key
- SOLO para Server Actions y jobs de Trigger.dev
- NUNCA exponer al cliente

### J) src/middleware.ts
- Middleware de autenticación con Supabase SSR
- Refrescar sesión JWT en cada request
- Redirigir usuarios no autenticados de /dashboard a /login
- Matcher excluyendo archivos estáticos

## PASO 3: CONFIGURACIÓN DE VARIABLES DE ENTORNO

Crea .env.local con placeholders y .env.local.example:

```env
# === SUPABASE ===
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:[password]@db.tu-proyecto.supabase.co:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres:[password]@db.tu-proyecto.supabase.co:5432/postgres

# === TRIGGER.DEV ===
TRIGGER_SECRET_KEY=tr_dev_xxxxxxxxxx

# === GEMINI (Antigravity) ===
GEMINI_API_KEY=AIza...

# === SEGURIDAD ===
REVALIDATION_SECRET=tu-secreto-aleatorio-32-caracteres
```

## PASO 4: ESTRUCTURA DE MÓDULOS DDD

Para CADA módulo (audit, performance, keywords, backlinks, competitors, reporting, integrations, cro), crea esta estructura interna:

src/modules/[nombre]/
├── domain/
│   ├── entities/           # Entidades de dominio puro
│   ├── value-objects/      # Objetos de valor inmutables
│   └── repositories/       # Interfaces de repositorio
├── application/
│   ├── use-cases/          # Casos de uso (lógica de negocio)
│   ├── dto/                # Data Transfer Objects
│   └── services/           # Servicios de aplicación
├── infrastructure/
│   ├── repositories/       # Implementaciones con Drizzle
│   ├── mappers/            # Mappers entidad <-> DB
│   └── external/           # Integraciones con APIs externas
└── presentation/
    ├── components/         # Componentes React específicos
    ├── server-actions/     # Server Actions de Next.js
    └── hooks/              # Custom hooks de React

## PASO 5: JOB DE PRUEBA EN TRIGGER.DEV

Crea src/trigger/hello.trigger.ts:

```typescript
import { task } from "@trigger.dev/sdk/v3";

export const helloJob = task({
  id: "hello-world",
  run: async (payload: { name: string }) => {
    console.log(`Hello ${payload.name}`);
    return { 
      message: `Hello ${payload.name}!`,
      timestamp: new Date().toISOString()
    };
  },
});
```

## PASO 6: CONFIGURACIÓN DE CI/CD

Crea .github/workflows/ci.yml:

```yaml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

## INSTRUCCIONES DE EJECUCIÓN

1. Ejecuta los pasos en ORDEN, uno a la vez
2. Después de cada comando de terminal, espera mi confirmación antes de continuar
3. Si encuentras un error, detente y explícame el error antes de continuar
4. Genera el código completo de cada archivo, no resúmenes
5. Usa TypeScript estricto en TODO el código
6. Incluye JSDoc en funciones públicas
7. Maneja errores con try/catch y retorna objetos Result { success, data, error }

## FORMATO DE RESPUESTA

Para cada paso, responde con:
- ✅ Confirmación del paso completado
- 📁 Lista de archivos creados/modificados
- 📝 Explicación breve de decisiones técnicas
- ⚠️ Advertencias o consideraciones especiales
- ➡️ Indicación del siguiente paso listo para ejecutar

COMIENZA AHORA con el Paso 1.
```

---

## 2. Prompts para Migraciones de Base de Datos

### Prompt 2.1: Crear primera migración desde cero

```
Actúa como DBA senior especializado en PostgreSQL y Supabase.

CONTEXTO:
- Usamos Drizzle ORM con PostgreSQL en Supabase
- El proyecto es StrategicAudit Pro (auditoría SEO)
- Necesitamos crear las tablas iniciales del sistema

TAREA:
Genera el archivo de migración SQL inicial para crear estas tablas con RLS activado:

1. **profiles** (extiende auth.users de Supabase)
   - id UUID PK (referencia a auth.users)
   - full_name TEXT
   - company_name TEXT
   - avatar_url TEXT
   - subscription_tier TEXT (default: 'free')
   - created_at TIMESTAMPTZ default now()
   - updated_at TIMESTAMPTZ default now()

2. **projects**
   - id UUID PK default gen_random_uuid()
   - user_id UUID FK → profiles.id
   - name TEXT NOT NULL
   - domain TEXT NOT NULL
   - description TEXT
   - status TEXT default 'active'
   - created_at TIMESTAMPTZ default now()
   - updated_at TIMESTAMPTZ default now()

3. **audits**
   - id UUID PK default gen_random_uuid()
   - project_id UUID FK → projects.id
   - status TEXT default 'pending'
   - config JSONB (configuración del crawl)
   - started_at TIMESTAMPTZ
   - completed_at TIMESTAMPTZ
   - created_at TIMESTAMPTZ default now()

4. **crawl_results**
   - id UUID PK default gen_random_uuid()
   - audit_id UUID FK → audits.id
   - url TEXT NOT NULL
   - title TEXT
   - meta_description TEXT
   - h1 TEXT
   - status_code INTEGER
   - content_type TEXT
   - page_size INTEGER
   - load_time_ms INTEGER
   - canonical_url TEXT
   - is_indexable BOOLEAN default true
   - issues JSONB
   - created_at TIMESTAMPTZ default now()

REQUISITOS:
- Todas las tablas deben tener RLS habilitado
- Crear políticas RLS para que los usuarios solo vean/modifiquen sus propios datos
- Añadir índices en columnas frecuentemente consultadas (user_id, project_id, audit_id, url)
- Usar TIMESTAMPTZ en lugar de TIMESTAMP
- Incluir comentarios en cada tabla y columna
- Generar también el archivo TypeScript de esquema para Drizzle ORM en src/shared/db/schemas/

FORMATO DE RESPUESTA:
1. Archivo SQL de migración completo (supabase/migrations/0000_initial_schema.sql)
2. Archivo TypeScript de esquema Drizzle (src/shared/db/schemas/index.ts)
3. Comando PowerShell para ejecutar la migración
4. Verificación de que RLS está funcionando
```

### Prompt 2.2: Migración de tabla de keywords

```
CONTEXTO:
Módulo de Keywords y Rank Tracking de StrategicAudit Pro.

TAREA:
Crear migración SQL y esquema Drizzle para:

1. **keyword_targets**
   - id UUID PK
   - project_id UUID FK
   - keyword TEXT NOT NULL
   - location TEXT default 'es-ES'
   - device TEXT default 'desktop' (desktop/mobile)
   - search_volume INTEGER
   - difficulty INTEGER (0-100)
   - cpc DECIMAL(10,2)
   - status TEXT default 'active'
   - created_at TIMESTAMPTZ
   - updated_at TIMESTAMPTZ
   - Índice único en (project_id, keyword, location, device)

2. **rank_history**
   - id UUID PK
   - keyword_id UUID FK → keyword_targets.id
   - position INTEGER (1-100, NULL si >100)
   - url_ranking TEXT
   - serp_features JSONB (featured snippets, etc.)
   - date DATE NOT NULL
   - created_at TIMESTAMPTZ
   - Índice en (keyword_id, date)

3. **competitor_keywords**
   - id UUID PK
   - project_id UUID FK
   - competitor_domain TEXT NOT NULL
   - keyword TEXT NOT NULL
   - their_position INTEGER
   - our_position INTEGER
   - date DATE NOT NULL
   - created_at TIMESTAMPTZ

REQUISITOS:
- RLS habilitado en todas las tablas
- Políticas: usuario solo accede a keywords de sus proyectos
- Índices para consultas frecuentes
- Particionamiento de rank_history por mes (usando TimescaleDB o PostgreSQL nativo)
- Triggers para actualizar updated_at automáticamente
- Generar también el esquema Zod para validación

ENTREGABLES:
1. SQL de migración
2. Esquema Drizzle TypeScript
3. Esquema Zod para validación
4. Políticas RLS
5. Comando de ejecución en PowerShell
```

### Prompt 2.3: Migración de backlinks

```
CONTEXTO:
Módulo de Backlinks de StrategicAudit Pro.

TAREA:
Crear migración para:

1. **backlinks**
   - id UUID PK
   - project_id UUID FK
   - source_url TEXT NOT NULL
   - target_url TEXT NOT NULL
   - anchor_text TEXT
   - link_type TEXT (dofollow/nofollow/sponsored/ugc)
   - domain_authority INTEGER (0-100)
   - page_authority INTEGER (0-100)
   - toxic_score INTEGER (0-100, calculado)
   - first_seen DATE
   - last_checked TIMESTAMPTZ
   - status TEXT default 'active'
   - created_at TIMESTAMPTZ

2. **backlink_history**
   - id UUID PK
   - backlink_id UUID FK
   - domain_authority INTEGER
   - page_authority INTEGER
   - toxic_score INTEGER
   - checked_at TIMESTAMPTZ
   - created_at TIMESTAMPTZ

3. **disavow_lists**
   - id UUID PK
   - project_id UUID FK
   - name TEXT
   - domains TEXT[] (array de dominios)
   - urls TEXT[] (array de URLs)
   - created_at TIMESTAMPTZ
   - updated_at TIMESTAMPTZ

REQUISITOS:
- RLS habilitado
- Índice GIN en source_url y target_url para búsqueda rápida
- Función PostgreSQL para calcular toxic_score basado en DA/PA y atributos
- Trigger para actualizar last_checked cuando se inserta en backlink_history
- Políticas RLS estrictas

ENTREGABLES:
1. SQL completo de migración
2. Esquema Drizzle
3. Función de cálculo de toxicidad
4. Comando PowerShell de ejecución
```

### Prompt 2.4: Migración de integraciones

```
CONTEXTO:
Módulo de Integraciones (Google Search Console, GA4, Bing Webmaster).

TAREA:
Crear migración para:

1. **integrations**
   - id UUID PK
   - project_id UUID FK
   - provider TEXT (gsc/ga4/bing/semrush/ahrefs)
   - name TEXT
   - config JSONB (tokens, IDs de propiedad)
   - status TEXT default 'connected'
   - last_sync_at TIMESTAMPTZ
   - created_at TIMESTAMPTZ
   - updated_at TIMESTAMPTZ

2. **integration_data_gsc**
   - id UUID PK
   - integration_id UUID FK
   - date DATE NOT NULL
   - query TEXT
   - page TEXT
   - clicks INTEGER
   - impressions INTEGER
   - ctr DECIMAL(5,4)
   - position DECIMAL(5,2)
   - created_at TIMESTAMPTZ
   - Índice en (integration_id, date, query)

3. **integration_data_ga4**
   - id UUID PK
   - integration_id UUID FK
   - date DATE NOT NULL
   - page_path TEXT
   - sessions INTEGER
   - users INTEGER
   - bounce_rate DECIMAL(5,4)
   - avg_session_duration INTEGER (segundos)
   - created_at TIMESTAMPTZ

4. **integration_data_bing**
   - Similar a GSC pero para Bing Webmaster

REQUISITOS:
- RLS habilitado
- Índices para consultas por fecha e integración
- Particionamiento por fecha (mensual) usando TimescaleDB
- Encriptación de tokens en config JSONB (usar pgcrypto)
- Políticas RLS

ENTREGABLES:
1. SQL de migración completo
2. Esquema Drizzle
3. Función de encriptación/desencriptación de tokens
4. Comando PowerShell
```

---

## 3. Prompts para Tests

### Prompt 3.1: Tests unitarios para casos de uso

```
Actúa como ingeniero de QA senior especializado en testing de aplicaciones Next.js.

CONTEXTO:
Proyecto StrategicAudit Pro con arquitectura DDD.
Usamos Vitest + @testing-library/react + jsdom.

TAREA:
Generar tests unitarios completos para estos casos de uso:

1. **CreateProjectUseCase**
   - Input: { name: string, domain: string, description?: string }
   - Debe validar que el dominio tenga formato correcto
   - Debe verificar que el usuario no exceda límite de proyectos (según tier)
   - Debe crear proyecto y retornar objeto Project
   - Debe manejar errores de base de datos

2. **StartAuditUseCase**
   - Input: { projectId: string, config: AuditConfig }
   - Debe verificar que el proyecto pertenezca al usuario
   - Debe crear registro de audit en BD
   - Debe disparar job de Trigger.dev "crawl-website"
   - Debe manejar error si Trigger.dev no responde

3. **CalculateToxicityUseCase**
   - Input: Backlink object
   - Debe calcular score 0-100 basado en:
     - domain_authority (menor DA = más tóxico)
     - page_authority
     - is_nofollow (reduce toxicidad)
     - is_sponsored (aumenta toxicidad)
     - anchor_text over-optimization
   - Debe retornar score y categoría (safe/suspicious/toxic)

REQUISITOS:
- Usar mocks para repositorios (NO tocar base de datos real)
- Mockear Trigger.dev SDK
- Cobertura mínima 80% de branches
- Tests para casos exitosos y de error
- Usar describe/it/expect de Vitest
- Incluir setup y teardown
- Usar beforeEach para resetear mocks

ESTRUCTURA DE ARCHIVOS:
src/modules/[modulo]/application/use-cases/__tests__/
  ├── create-project.use-case.test.ts
  ├── start-audit.use-case.test.ts
  └── calculate-toxicity.use-case.test.ts

FORMATO:
1. Código completo de cada archivo de test
2. Explicación de estrategia de mocking
3. Cómo ejecutar: pnpm test
4. Cómo ver cobertura: pnpm test:coverage
```

### Prompt 3.2: Tests de integración para Server Actions

```
CONTEXTO:
Server Actions de Next.js 15 que interactúan con Supabase.

TAREA:
Generar tests de integración para estas Server Actions:

1. **createProjectAction**
   - Inserta en tabla projects
   - Valida con Zod antes de insertar
   - Revalida cache de Next.js
   - Maneja errores de RLS

2. **startAuditAction**
   - Verifica autenticación
   - Crea audit en BD
   - Dispara job de Trigger.dev
   - Retorna auditId y runId

3. **updateKeywordAction**
   - Actualiza keyword_targets
   - Verifica pertenencia al proyecto
   - Maneja concurrencia (optimistic locking)

REQUISITOS:
- Usar Supabase test container o mock de cliente
- Mockear cookies de Next.js
- Verificar que RLS se respeta
- Tests para autenticación fallida
- Usar Vitest con modo concurrente
- Limpiar BD después de cada test

ENTREGABLES:
1. Archivos de test completos
2. Configuración de test environment
3. Helpers para autenticación en tests
4. Comando de ejecución
```

### Prompt 3.3: Tests E2E con Playwright

```
CONTEXTO:
Flujos críticos de usuario en StrategicAudit Pro.

TAREA:
Generar tests E2E con Playwright para estos flujos:

1. **Flujo de Autenticación**
   - Registro con email/contraseña
   - Login exitoso
   - Logout
   - Recuperación de contraseña

2. **Flujo de Proyecto**
   - Crear nuevo proyecto
   - Ver lista de proyectos
   - Editar proyecto
   - Eliminar proyecto

3. **Flujo de Auditoría**
   - Iniciar auditoría desde dashboard
   - Ver progreso de crawl
   - Ver resultados de auditoría
   - Exportar reporte

4. **Flujo de Keywords**
   - Añadir keyword
   - Ver historial de posiciones
   - Editar keyword
   - Eliminar keyword

REQUISITOS:
- Usar Page Object Model (POM)
- Fixtures para autenticación
- Screenshots en fallos
- Tests paralelos (workers: 4)
- Configuración para CI (headless)
- Variables de entorno para URLs

ESTRUCTURA:
e2e/
  ├── fixtures/
  │   └── auth.fixture.ts
  ├── pages/
  │   ├── login.page.ts
  │   ├── dashboard.page.ts
  │   ├── project.page.ts
  │   └── audit.page.ts
  ├── tests/
  │   ├── auth.spec.ts
  │   ├── project.spec.ts
  │   ├── audit.spec.ts
  │   └── keyword.spec.ts
  └── playwright.config.ts

ENTREGABLES:
1. playwright.config.ts completo
2. Todos los archivos de Page Objects
3. Todos los archivos de test
4. Comando de ejecución local y CI
```

### Prompt 3.4: Tests para jobs de Trigger.dev

```
CONTEXTO:
Jobs asíncronos de Trigger.dev v3 que realizan operaciones pesadas.

TAREA:
Generar tests unitarios para estos jobs:

1. **crawlWebsite**
   - Input: { auditId, url, maxPages }
   - Debe hacer fetch de URLs recursivamente
   - Debe respetar maxPages
   - Debe guardar resultados en Supabase
   - Debe manejar timeouts y errores de red

2. **fetchPerformanceMetrics**
   - Input: { projectId, urls[] }
   - Debe llamar PageSpeed Insights API
   - Debe parsear Core Web Vitals
   - Debe guardar métricas en performance_results
   - Debe manejar límites de API (rate limiting)

3. **generateReport**
   - Input: { reportId, format: 'pdf' | 'excel' }
   - Debe generar archivo desde datos de BD
   - Debe subir a Supabase Storage
   - Debe actualizar estado del reporte
   - Debe manejar errores de generación

REQUISITOS:
- Mockear fetch/axios
- Mockear cliente de Supabase
- Mockear APIs externas (PageSpeed, etc.)
- Verificar que los jobs retornan el formato esperado
- Tests para reintentos (retry logic)
- Usar Vitest con timers falsos

ENTREGABLES:
1. Archivos de test para cada job
2. Mocks de APIs externas
3. Helpers para simular errores de red
4. Comando de ejecución
```

---

## 4. Prompts para Módulos Core

### Prompt 4.1: Módulo de Auditoría (Crawl)

```
CONTEXTO:
Módulo más crítico de StrategicAudit Pro. Realiza crawls de sitios web.

TAREA:
Generar el módulo completo audit/ con estructura DDD:

1. **Dominio:**
   - Entidad Audit (id, projectId, status, config, timestamps)
   - Entidad CrawlResult (id, auditId, url, title, meta, h1, statusCode, issues[])
   - Value Object AuditConfig (maxPages, respectRobots, userAgent)
   - Interface IAuditRepository

2. **Aplicación:**
   - StartAuditUseCase
   - GetAuditResultsUseCase
   - GetAuditProgressUseCase
   - DTOs con Zod

3. **Infraestructura:**
   - AuditRepository con Drizzle
   - CrawlService (lógica de crawling con fetch)
   - Mapper Audit <-> DB

4. **Presentación:**
   - Server Action: startAuditAction
   - Server Action: getAuditResultsAction
   - Componente: AuditProgressBar (con realtime)
   - Componente: AuditResultsTable
   - Página: /dashboard/projects/[id]/audits
   - Página: /dashboard/projects/[id]/audits/[auditId]

REQUISITOS:
- Crawl debe ser recursivo pero respetar maxPages
- Debe parsear HTML básico (title, meta, h1, links)
- Debe detectar issues SEO básicos (missing title, duplicate h1, etc.)
- Usar Trigger.dev para ejecutar crawl en background
- Actualizar progreso vía Supabase Realtime
- Manejar errores de red con reintentos
- TypeScript estricto, JSDoc, manejo de errores

ENTREGABLES:
1. Todos los archivos del módulo
2. Job de Trigger.dev para crawl
3. Componentes UI con shadcn/ui
4. Tests unitarios
```

### Prompt 4.2: Módulo de Performance

```
CONTEXTO:
Módulo de Core Web Vitals y métricas de rendimiento.

TAREA:
Generar módulo performance/ completo:

1. **Dominio:**
   - Entidades: PerformanceMetric, CoreWebVital
   - Value Objects: LCP, CLS, INP, FCP, TTFB
   - Interfaces de repositorio

2. **Aplicación:**
   - FetchMetricsUseCase (usa PageSpeed Insights API)
   - GetHistoricalMetricsUseCase
   - CalculatePerformanceScoreUseCase

3. **Infraestructura:**
   - PerformanceRepository con Drizzle
   - PageSpeedService (wrapper de API)
   - CrUXService (Chrome User Experience Report)

4. **Presentación:**
   - Dashboard con gráficos (Recharts)
   - Tabla de métricas históricas
   - Alertas cuando métricas empeoran
   - Página: /dashboard/projects/[id]/performance

REQUISITOS:
- Integrar PageSpeed Insights API v5
- Parsear métricas LCP, CLS, INP, FCP, TTFB
- Almacenar historial para tendencias
- Gráficos de evolución temporal
- Comparativa con competidores
- Job diario programado en Trigger.dev
- TypeScript estricto

ENTREGABLES:
1. Módulo completo
2. Job de Trigger.dev programado
3. Componentes de gráficos
4. Tests
```

### Prompt 4.3: Módulo de Keywords

```
CONTEXTO:
Rank tracking y análisis de keywords.

TAREA:
Generar módulo keywords/ completo:

1. **Dominio:**
   - Entidades: KeywordTarget, RankHistory, SERPFeature
   - Value Objects: Position, SearchVolume, KeywordDifficulty

2. **Aplicación:**
   - AddKeywordUseCase
   - UpdateRankingsUseCase
   - GetKeywordHistoryUseCase
   - GetCompetitorComparisonUseCase

3. **Infraestructura:**
   - KeywordRepository con Drizzle
   - SERPService (simulado o integración real)
   - RankTrackerService

4. **Presentación:**
   - Tabla editable de keywords (TanStack Table)
   - Gráfico de posiciones históricas
   - Filtros por ubicación y dispositivo
   - Página: /dashboard/projects/[id]/keywords

REQUISITOS:
- Soporte para múltiples ubicaciones (es-ES, en-US, etc.)
- Soporte desktop/mobile
- Actualización diaria vía Trigger.dev
- Indicadores de tendencia (↑↓→)
- Alertas de cambios significativos
- Exportar a CSV/Excel

ENTREGABLES:
1. Módulo completo
2. Job diario de actualización
3. Componentes UI
4. Tests
```

### Prompt 4.4: Módulo de Reporting

```
CONTEXTO:
Generación de reportes PDF/Excel para clientes.

TAREA:
Generar módulo reporting/ completo:

1. **Dominio:**
   - Entidades: Report, ReportTemplate, ReportSection
   - Value Objects: ReportFormat, ReportPeriod

2. **Aplicación:**
   - CreateReportUseCase
   - GenerateReportUseCase
   - ScheduleReportUseCase
   - GetReportHistoryUseCase

3. **Infraestructura:**
   - ReportRepository con Drizzle
   - PDFGeneratorService (usar librería como Puppeteer o jsPDF)
   - ExcelGeneratorService (usar xlsx)
   - SupabaseStorageService

4. **Presentación:**
   - Constructor de reportes drag-and-drop
   - Selector de widgets (gráficos, tablas, texto)
   - Preview de reporte
   - Lista de reportes generados
   - Página: /dashboard/projects/[id]/reports

REQUISITOS:
- Templates predefinidos (SEO Audit, Performance, Keywords)
- Constructor visual de reportes
- Exportar PDF con branding del proyecto
- Exportar Excel con múltiples hojas
- Programar envío semanal/mensual
- Almacenar en Supabase Storage
- TypeScript estricto

ENTREGABLES:
1. Módulo completo
2. Job de generación de reportes
3. Componentes UI del constructor
4. Tests
```

---

## 5. Prompts para Integraciones

### Prompt 5.1: Integración Google Search Console

```
CONTEXTO:
Sincronización de datos de Google Search Console.

TAREA:
Generar integración completa:

1. **OAuth2 Flow:**
   - Configurar proveedor en Supabase Auth
   - Callback handler
   - Almacenar tokens encriptados

2. **Sincronización:**
   - Job Trigger.dev: syncGSC
   - Extraer datos de GSC API (queries, pages, countries, devices)
   - Almacenar en integration_data_gsc
   - Manejar paginación de API
   - Manejar rate limits

3. **UI:**
   - Botón "Conectar GSC"
   - Selector de propiedad
   - Vista de datos de GSC en dashboard
   - Gráficos de clicks/impressions

REQUISITOS:
- Usar OAuth2 de Google con scopes: webmasters.readonly
- Refrescar token automáticamente
- Sincronización diaria programada
- Manejar errores de autorización
- TypeScript estricto

ENTREGABLES:
1. Configuración OAuth
2. Job de sincronización
3. Componentes UI
4. Tests
```

### Prompt 5.2: Integración Google Analytics 4

```
CONTEXTO:
Sincronización de datos de GA4.

TAREA:
Generar integración completa:

1. **OAuth2 Flow:**
   - Similar a GSC pero con scopes de Analytics
   - Selector de property GA4

2. **Sincronización:**
   - Job Trigger.dev: syncGA4
   - Extraer métricas: sessions, users, bounceRate, avgSessionDuration
   - Almacenar en integration_data_ga4
   - Soporte para dimensiones personalizadas

3. **UI:**
   - Conexión de GA4
   - Dashboard con métricas de tráfico
   - Comparativa periodo anterior

ENTREGABLES:
1. Configuración completa
2. Job de sincronización
3. Componentes UI
4. Tests
```

---

## 6. Prompts para CI/CD y Despliegue

### Prompt 6.1: GitHub Actions CI completo

```
CONTEXTO:
Pipeline de CI/CD para Vercel + Supabase + Trigger.dev.

TAREA:
Generar workflows de GitHub Actions:

1. **ci.yml** (Pull Requests):
   - Instalar dependencias
   - Lint (ESLint + Prettier)
   - Type check (tsc --noEmit)
   - Tests unitarios (Vitest)
   - Tests E2E (Playwright)
   - Build de Next.js

2. **cd.yml** (Deploy a producción):
   - Ejecutar migraciones de Supabase
   - Deploy a Vercel (producción)
   - Deploy de jobs Trigger.dev
   - Notificación de éxito/fallo

3. **preview.yml** (Deploy de previews):
   - Deploy preview en Vercel para cada PR
   - Variables de entorno de preview

REQUISITOS:
- Usar pnpm
- Cache de dependencias
- Secrets de GitHub para tokens
- Condicionales para evitar deploys en forks
- TypeScript estricto en configuración

ENTREGABLES:
1. .github/workflows/ci.yml
2. .github/workflows/cd.yml
3. .github/workflows/preview.yml
4. Documentación de secrets requeridos
```

### Prompt 6.2: Configuración de Vercel

```
CONTEXTO:
Deploy óptimo en Vercel con Supabase.

TAREA:
Generar configuración:

1. **vercel.json:**
   - Headers de seguridad
   - Redirects
   - Rewrites
   - Configuración de funciones (memory, maxDuration)

2. **next.config.ts:**
   - Output standalone
   - Configuración de imágenes
   - Variables de entorno públicas
   - Experimental features

3. **Scripts de deploy:**
   - Deploy manual
   - Deploy con migraciones
   - Rollback

REQUISITOS:
- Optimizar para cold starts
- Configurar Edge Functions donde aplique
- Headers de seguridad (CSP, HSTS, X-Frame-Options)
- TypeScript estricto

ENTREGABLES:
1. vercel.json
2. next.config.ts completo
3. Scripts de deploy
4. Documentación
```

---

## 7. Checklist de Ejecución

### Semana 1-2: Fundación
- [ ] Instalar Google Antigravity en Windows 11
- [ ] Ejecutar Prompt Maestro de Inicialización
- [ ] Crear proyecto Supabase de desarrollo
- [ ] Ejecutar migración inicial (Prompt 2.1)
- [ ] Configurar Trigger.dev v3
- [ ] Verificar autenticación (login/logout)
- [ ] Primer deploy preview en Vercel

### Semana 3-4: Módulos Core
- [ ] Generar módulo de Auditoría (Prompt 4.1)
- [ ] Generar módulo de Performance (Prompt 4.2)
- [ ] Generar tests unitarios (Prompt 3.1)
- [ ] Generar tests E2E básicos (Prompt 3.3)
- [ ] Integrar PageSpeed Insights API

### Semana 5: Keywords y Reporting
- [ ] Generar módulo de Keywords (Prompt 4.3)
- [ ] Generar módulo de Reporting (Prompt 4.4)
- [ ] Generar migración de keywords (Prompt 2.2)
- [ ] Configurar job diario de rankings

### Semana 6-7: Integraciones
- [ ] Integrar Google Search Console (Prompt 5.1)
- [ ] Integrar Google Analytics 4 (Prompt 5.2)
- [ ] Generar migración de integraciones (Prompt 2.4)
- [ ] Configurar OAuth2 flows

### Semana 8: Testing y Optimización
- [ ] Ejecutar todos los tests (unitarios, integración, E2E)
- [ ] Verificar cobertura >80%
- [ ] Optimizar queries de base de datos
- [ ] Configurar caché (React Cache + TanStack Query)
- [ ] Verificar tiempos de carga <3s

### Semana 9-10: Despliegue
- [ ] Configurar CI/CD (Prompt 6.1)
- [ ] Configurar Vercel production (Prompt 6.2)
- [ ] Crear proyecto Supabase de producción
- [ ] Ejecutar migraciones en producción
- [ ] Deploy de Trigger.dev jobs
- [ ] Configurar Sentry
- [ ] Configurar backups automáticos

---

## 8. Solución de Problemas Comunes

### Problema: Antigravity bloquea comandos de terminal
**Solución:** Usar formato flat sin comillas externas:
```powershell
# ✅ CORRECTO
pwsh -c pnpm install

# ❌ INCORRECTO (el parser lo bloquea)
pwsh -c "pnpm install"
```

### Problema: RLS bloquea datos silenciosamente
**Solución:** Verificar siempre `auth.getUser()` en middleware y Server Actions. Usar helper de debug en desarrollo.

### Problema: Migraciones fallan en Vercel build
**Solución:** NUNCA ejecutar migraciones durante el build. Usar GitHub Actions con DIRECT_URL antes del deploy.

### Problema: Cold starts >3s en Vercel
**Solución:** Usar Edge Functions para rutas críticas. Habilitar Vercel Fluid Compute. Mantener conexión a Supabase viva.

### Problema: Trigger.dev tasks no aparecen
**Solución:** Verificar `trigger.config.ts` tiene `dirs` correcto. Ejecutar `npx trigger.dev@latest deploy` después de cada cambio.

### Problema: Variables de entorno faltantes
**Solución:** Validar en build-time con `src/shared/config/env.ts`. Usar `.env.local.example` como documentación.

---

**Documento generado el 2026-05-07 para StrategicAudit Pro**  
**Versión 2.0 - Google Antigravity IDE + Windows 11 + Vercel + Supabase + Trigger.dev v3**
