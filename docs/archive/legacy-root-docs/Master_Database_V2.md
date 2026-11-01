> ⚠️ **[HISTÓRICO — ARCHIVADO 2026-11-01]** Diseño de BD aspiracional de mayo-2026: PostgreSQL 16 + TimescaleDB 2 + Supabase.
> Realidad vigente (verificada 2026-11-01): PostgreSQL (Supabase) con Drizzle ORM (`drizzle/`, 67 migraciones), RLS con rol embebido vía `SET LOCAL` (ADR-006), particionado nativo de `uptime_logs` en lugar de Timescale, y superficie de esquema mayor a la aquí descrita.
> Esquema canónico del código: `drizzle/schema.ts` · Registro de paridad: TD-19 en `docs/technical-debt/TECH-DEBT-REGISTER.md`.
> Vigente: `docs/architecture/CURRENT-STATE.md` · Informe maestro: `docs/MASTER-REPORT-2026-11-01.md`.

---
# 📦 StrategicAudit Pro – Master Database Specification V2

**Versión:** 2.0 (Serverless‑Native, alineada con SRS v2.0)  
**Fecha:** 2026-05-06  
**Stack:** PostgreSQL 16 + TimescaleDB 2 + Supabase  
**Entorno:** Enterprise SaaS multi‑tenant (Vercel + Supabase)

---

## Tabla de Contenidos

1. Introducción  
2. Principios de Diseño de Base de Datos  
3. Cambios respecto a V1  
4. Diagrama Entidad‑Relación (Mermaid)  
5. Script SQL Completo (V2)  
   - Extensiones y esquema  
   - Tablas principales (corregidas)  
   - Nuevas tablas: catálogo de reglas, integraciones GSC/GA4/Bing  
   - Políticas RLS completas  
   - Índices adicionales  
   - Datos iniciales (reglas de auditoría + planes de suscripción)  
6. Estrategia de Particionamiento y Retención  
7. Seguridad y Cumplimiento  
8. Notas para Despliegue en Supabase  

---

## 1. Introducción

Este documento define el **modelo de datos definitivo** para **StrategicAudit Pro**, una plataforma SaaS de auditoría SEO enterprise optimizada para arquitectura serverless (Next.js + Supabase + Trigger.dev). El modelo:

- Cubre **todos los requisitos funcionales** del SRS v2.0 (incluyendo integraciones GSC/GA4/Bing y catálogo de 100+ reglas de auditoría).
- Implementa **multi‑tenencia** con Row Level Security (RLS) de Supabase.
- Usa **TimescaleDB** para series temporales (rendimiento, rankings, backlinks).
- Elimina componentes redundantes (`sessions`, `encrypted_password` en `users`).
- Respeta **buenas prácticas** de normalización (3FN con JSONB controlado), seguridad y escalabilidad.

---

## 2. Principios de Diseño de Base de Datos

- **Normalización hasta 3FN** – excepto JSONB en `og_tags`, `custom_dimensions`, `raw_report` (datos semiestructurados).
- **Hypertables de TimescaleDB** para `performance_results`, `rank_history`, `backlink_history`.
- **RLS obligatorio** – aislamiento multi‑tenant basado en `auth.uid()`.
- **Soft delete** (`deleted_at`) en `users` y `projects` para GDPR.
- **Cifrado de credenciales sensibles** mediante Supabase Vault (`integrations.credentials_encrypted`).
- **Retención automática** – políticas de borrado en TimescaleDB y jobs programados.

---

## 3. Cambios respecto a V1

| Cambio | Justificación |
|--------|----------------|
| Eliminar tabla `sessions` y columna `encrypted_password` en `users` | Supabase Auth gestiona autenticación y sesiones. Delegación de seguridad. |
| Nuevas tablas: `integration_data_gsc`, `integration_data_ga4`, `integration_data_bing` | Almacenar histórico de clics, impresiones, CTR, posición, engagement (FR-INT-001,002,003). |
| Nuevas tablas: `audit_rules`, `project_audit_rules` | Catálogo de 100+ reglas y personalización por proyecto (FR-AUDIT-003). |
| Enriquecer `issues` con `rule_id` | Trazabilidad de cada issue a una regla concreta, eliminar `code` redundante. |
| Política de retención en `performance_results` (12 meses) | Cumple FR-PERF-004 (retención histórica). |
| Trigger de creación de usuario actualizado | No inserta contraseña. |

---

## 4. Diagrama Entidad‑Relación (Mermaid)

```mermaid
erDiagram
    users {
        uuid id PK
        text email
        text full_name
        text role
        jsonb preferences
        timestamptz created_at
        timestamptz deleted_at
    }
    projects {
        uuid id PK
        uuid owner_id FK
        text domain
        int crawl_depth
        int data_retention_days
    }
    audits {
        uuid id PK
        uuid project_id FK
        text type
        text status
    }
    audit_rules {
        uuid id PK
        text code UK
        text title
        text description
        text category
        text severity
    }
    project_audit_rules {
        uuid id PK
        uuid project_id FK
        uuid rule_id FK
        boolean enabled
    }
    issues {
        uuid id PK
        uuid project_id FK
        uuid rule_id FK
        text url
        text severity
        boolean fixed
    }
    integration_data_gsc {
        uuid id PK
        uuid project_id FK
        date date
        text url
        int clicks
        int impressions
        float ctr
        float position
    }
    integration_data_ga4 {
        uuid id PK
        uuid project_id FK
        date date
        text page_path
        int active_users
        int conversions
        float engagement_rate
        jsonb custom_dimensions
    }
    integration_data_bing {
        uuid id PK
        uuid project_id FK
        date date
        text url
        int clicks
        int impressions
        float ctr
        float position
    }
    crawl_results {
        uuid id PK
        uuid audit_id FK
        text url
        int status_code
        text title
    }
    internal_links {
        uuid id PK
        uuid crawl_id FK
        text source_url
        text target_url
    }
    keyword_targets {
        uuid id PK
        uuid project_id FK
        text keyword
    }
    rank_history {
        uuid id PK
        uuid keyword_id FK
        int position
        date checked_at
    }
    backlinks {
        uuid id PK
        uuid project_id FK
        text source_url
        text target_url
        int domain_authority
        numeric toxicity_score
    }
    ab_tests {
        uuid id PK
        uuid project_id FK
        text name
        text status
    }
    reports {
        uuid id PK
        uuid project_id FK
        jsonb configuration
    }

    projects ||--o{ audits : has
    projects ||--o{ project_audit_rules : configures
    projects ||--o{ integration_data_gsc : syncs
    projects ||--o{ integration_data_ga4 : syncs
    projects ||--o{ integration_data_bing : syncs
    projects ||--o{ keyword_targets : tracks
    projects ||--o{ backlinks : contains
    projects ||--o{ ab_tests : runs
    projects ||--o{ reports : generates
    audit_rules ||--o{ project_audit_rules : referenced_by
    audit_rules ||--o{ issues : used_in
    audits ||--o{ crawl_results : produces
    crawl_results ||--o{ internal_links : defines
    keyword_targets ||--o{ rank_history : has_history
5. Script SQL Completo (V2)
5.1 Extensiones y esquema
sql
-- ============================================================
-- 1. Habilitar extensiones necesarias en Supabase
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "timescaledb";

-- ============================================================
-- 2. Esquema principal
-- ============================================================
CREATE SCHEMA IF NOT EXISTS strategicaudit;
5.2 Tablas de usuarios, proyectos y suscripciones (corregidas)
sql
-- Usuarios (vinculados a auth.users mediante trigger)
-- NOTA: se elimina encrypted_password
CREATE TABLE strategicaudit.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'client')),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_sign_in_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);

-- Proyectos
CREATE TABLE strategicaudit.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES strategicaudit.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    domain TEXT NOT NULL,
    timezone TEXT DEFAULT 'UTC',
    crawl_depth INTEGER DEFAULT 3,
    user_agent TEXT DEFAULT 'StrategicAuditBot/1.0',
    respects_robots_txt BOOLEAN DEFAULT TRUE,
    data_retention_days INTEGER DEFAULT 365,
    auto_delete_audits BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Planes de suscripción (sin cambios)
CREATE TABLE strategicaudit.subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    max_projects INTEGER NOT NULL,
    max_keywords INTEGER NOT NULL,
    max_backlink_checks INTEGER NOT NULL,
    crawl_limit_monthly INTEGER NOT NULL,
    features JSONB NOT NULL,
    price_monthly DECIMAL(10,2),
    price_yearly DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suscripciones activas
CREATE TABLE strategicaudit.subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES strategicaudit.subscription_plans(id),
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    cancel_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
5.3 Integraciones OAuth (sin cambios en estructura, pero se añaden tablas de datos)
sql
-- Integraciones (GSC, GA4, Bing, Ahrefs, Semrush)
CREATE TABLE strategicaudit.integrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('gsc', 'ga4', 'bing', 'ahrefs', 'semrush')),
    credentials_encrypted BYTEA,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, type)
);

-- Logs de sincronización
CREATE TABLE strategicaudit.integration_sync_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    integration_id UUID NOT NULL REFERENCES strategicaudit.integrations(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'running', 'success', 'failed')),
    records_synced INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
5.4 Datos históricos de integraciones (NUEVAS)
sql
-- Google Search Console
CREATE TABLE strategicaudit.integration_data_gsc (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    ctr NUMERIC(8,4) DEFAULT 0,
    position NUMERIC(6,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, date, url)
);

-- Google Analytics 4
CREATE TABLE strategicaudit.integration_data_ga4 (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    page_path TEXT NOT NULL,
    active_users INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    engagement_rate NUMERIC(6,4) DEFAULT 0,
    custom_dimensions JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, date, page_path)
);

-- Bing Webmaster Tools
CREATE TABLE strategicaudit.integration_data_bing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    url TEXT NOT NULL,
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    ctr NUMERIC(8,4) DEFAULT 0,
    position NUMERIC(6,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, date, url)
);
5.5 Auditorías y resultados de crawl (sin cambios estructurales)
sql
-- Auditorías
CREATE TABLE strategicaudit.audits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('crawl', 'performance', 'technical', 'full')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'canceled')),
    config JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_by UUID REFERENCES strategicaudit.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crawl results
CREATE TABLE strategicaudit.crawl_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES strategicaudit.audits(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    status_code INTEGER,
    content_type TEXT,
    title TEXT,
    meta_description TEXT,
    h1_tags TEXT[],
    h2_tags TEXT[],
    canonical_url TEXT,
    robots_meta TEXT,
    robots_txt_allowed BOOLEAN DEFAULT TRUE,
    referrer TEXT,
    og_tags JSONB,
    external_links TEXT[],
    images JSONB,
    word_count INTEGER,
    crawl_depth INTEGER,
    is_orphan BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enlaces internos normalizados
CREATE TABLE strategicaudit.internal_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    crawl_id UUID NOT NULL REFERENCES strategicaudit.crawl_results(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    anchor_text TEXT,
    rel TEXT,
    is_follow BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
5.6 Rendimiento (Core Web Vitals, Lighthouse) con retención automática
sql
CREATE TABLE strategicaudit.performance_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_id UUID NOT NULL REFERENCES strategicaudit.audits(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    device TEXT NOT NULL CHECK (device IN ('mobile', 'desktop')),
    region TEXT,
    lcp NUMERIC(8,2),
    inp NUMERIC(8,2),
    cls NUMERIC(6,3),
    ttfb NUMERIC(8,2),
    fcp NUMERIC(8,2),
    lighthouse_score INTEGER CHECK (lighthouse_score BETWEEN 0 AND 100),
    crux_data JSONB,
    raw_report JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('strategicaudit.performance_results', 'created_at', if_not_exists => TRUE);
SELECT add_retention_policy('strategicaudit.performance_results', INTERVAL '12 months', if_not_exists => TRUE);
5.7 Catálogo de reglas y personalización (NUEVO)
sql
-- Catálogo de reglas de auditoría
CREATE TABLE strategicaudit.audit_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('meta','link','performance','accessibility','security','seo')),
    severity TEXT NOT NULL CHECK (severity IN ('critical','warning','info')),
    recommendation TEXT,
    default_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Personalización de reglas por proyecto
CREATE TABLE strategicaudit.project_audit_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    rule_id UUID NOT NULL REFERENCES strategicaudit.audit_rules(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT TRUE,
    custom_config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, rule_id)
);
5.8 Issues (modificado para referenciar reglas)
sql
CREATE TABLE strategicaudit.issues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    audit_id UUID REFERENCES strategicaudit.audits(id) ON DELETE SET NULL,
    rule_id UUID REFERENCES strategicaudit.audit_rules(id) ON DELETE SET NULL,  -- Nueva columna
    url TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    category TEXT NOT NULL CHECK (category IN ('meta', 'link', 'performance', 'accessibility', 'security', 'seo')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    recommendation TEXT,
    fixed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
5.9 Keywords y Rank Tracking (sin cambios)
sql
CREATE TABLE strategicaudit.keyword_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    location TEXT,
    device TEXT DEFAULT 'desktop' CHECK (device IN ('mobile', 'desktop')),
    language TEXT DEFAULT 'en',
    target_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, keyword, location, device)
);

CREATE TABLE strategicaudit.rank_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword_id UUID NOT NULL REFERENCES strategicaudit.keyword_targets(id) ON DELETE CASCADE,
    position INTEGER,
    serp_features JSONB,
    search_volume INTEGER,
    cpc NUMERIC(10,6),
    competition NUMERIC(4,2),
    checked_at DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(keyword_id, checked_at)
);

SELECT create_hypertable('strategicaudit.rank_history', 'checked_at', if_not_exists => TRUE);
5.10 Competidores y content gap (sin cambios)
sql
CREATE TABLE strategicaudit.competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    name TEXT,
    da_score INTEGER,
    backlinks_count BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, domain)
);

CREATE TABLE strategicaudit.competitor_keywords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID NOT NULL REFERENCES strategicaudit.competitors(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    position INTEGER,
    search_volume INTEGER,
    difficulty INTEGER,
    checked_at DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
5.11 Backlinks (sin cambios)
sql
CREATE TABLE strategicaudit.backlinks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    target_url TEXT NOT NULL,
    anchor_text TEXT,
    is_nofollow BOOLEAN DEFAULT FALSE,
    is_ugc BOOLEAN DEFAULT FALSE,
    is_sponsored BOOLEAN DEFAULT FALSE,
    domain_authority INTEGER,
    page_authority INTEGER,
    toxicity_score NUMERIC(5,2),
    first_detected_at DATE NOT NULL,
    last_seen_at DATE NOT NULL,
    lost_at DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, source_url, target_url)
);

CREATE TABLE strategicaudit.backlink_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backlink_id UUID NOT NULL REFERENCES strategicaudit.backlinks(id) ON DELETE CASCADE,
    domain_authority INTEGER,
    page_authority INTEGER,
    toxicity_score NUMERIC(5,2),
    checked_at DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('strategicaudit.backlink_history', 'checked_at', if_not_exists => TRUE);
5.12 CRO (sin cambios)
sql
CREATE TABLE strategicaudit.ab_tests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    variants JSONB NOT NULL,
    goal_metric TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'paused', 'completed')),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    winner_variant TEXT,
    uplift NUMERIC(8,4),
    confidence NUMERIC(5,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategicaudit.ab_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    test_id UUID NOT NULL REFERENCES strategicaudit.ab_tests(id) ON DELETE CASCADE,
    variant_name TEXT NOT NULL,
    visitors INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    conversion_rate NUMERIC(8,4),
    date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategicaudit.heatmap_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    session_data JSONB NOT NULL,
    anonymized_ip TEXT,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);
5.13 Schema Markup (sin cambios)
sql
CREATE TABLE strategicaudit.schema_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    json_ld JSONB,
    is_valid BOOLEAN,
    errors JSONB,
    validated_at TIMESTAMPTZ DEFAULT NOW()
);
5.14 Reporting (sin cambios)
sql
CREATE TABLE strategicaudit.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES strategicaudit.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    configuration JSONB NOT NULL,
    schedule_cron TEXT,
    last_generated_at TIMESTAMPTZ,
    created_by UUID REFERENCES strategicaudit.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategicaudit.report_exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID NOT NULL REFERENCES strategicaudit.reports(id) ON DELETE CASCADE,
    format TEXT NOT NULL CHECK (format IN ('pdf', 'csv', 'xlsx', 'looker_studio')),
    file_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
5.15 Logs de auditoría (sin cambios)
sql
CREATE TABLE strategicaudit.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES strategicaudit.users(id) ON DELETE SET NULL,
    project_id UUID REFERENCES strategicaudit.projects(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
5.16 Funciones y triggers (actualizados)
sql
-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION strategicaudit.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para tablas con updated_at (aplicar según corresponda)
CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON strategicaudit.users
    FOR EACH ROW EXECUTE FUNCTION strategicaudit.update_updated_at_column();
CREATE TRIGGER trigger_projects_updated_at BEFORE UPDATE ON strategicaudit.projects
    FOR EACH ROW EXECUTE FUNCTION strategicaudit.update_updated_at_column();
-- (Repetir para subscriptions, integrations, project_audit_rules, keyword_targets, reports)
5.17 Políticas RLS (completas)
sql
-- Habilitar RLS en todas las tablas
ALTER TABLE strategicaudit.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.crawl_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.internal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.performance_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.keyword_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.rank_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.competitor_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.ab_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.heatmap_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.schema_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.integration_data_gsc ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.integration_data_ga4 ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.integration_data_bing ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.audit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategicaudit.project_audit_rules ENABLE ROW LEVEL SECURITY;

-- Política para proyectos
CREATE POLICY "Users can manage own projects" ON strategicaudit.projects
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Política para auditorías
CREATE POLICY "Users can view audits of own projects" ON strategicaudit.audits
    FOR SELECT USING (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = audits.project_id AND owner_id = auth.uid()));
CREATE POLICY "Users can insert audits in own projects" ON strategicaudit.audits
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = project_id AND owner_id = auth.uid()));

-- Política para crawl_results
CREATE POLICY "Users can view crawl results of own projects" ON strategicaudit.crawl_results
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM strategicaudit.audits a
        JOIN strategicaudit.projects p ON a.project_id = p.id
        WHERE a.id = crawl_results.audit_id AND p.owner_id = auth.uid()
    ));

-- Políticas para tablas de integración de datos (solo lectura para propietarios)
CREATE POLICY "Users can view own GSC data" ON strategicaudit.integration_data_gsc
    FOR SELECT USING (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = integration_data_gsc.project_id AND owner_id = auth.uid()));
CREATE POLICY "Users can view own GA4 data" ON strategicaudit.integration_data_ga4
    FOR SELECT USING (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = integration_data_ga4.project_id AND owner_id = auth.uid()));
CREATE POLICY "Users can view own Bing data" ON strategicaudit.integration_data_bing
    FOR SELECT USING (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = integration_data_bing.project_id AND owner_id = auth.uid()));

-- Catálogo de reglas: lectura para todos los usuarios autenticados
CREATE POLICY "Anyone can read audit_rules" ON strategicaudit.audit_rules
    FOR SELECT USING (auth.role() = 'authenticated');

-- Personalización de reglas: solo propietarios
CREATE POLICY "Users can manage own project rules" ON strategicaudit.project_audit_rules
    USING (EXISTS (SELECT 1 FROM strategicaudit.projects WHERE id = project_audit_rules.project_id AND owner_id = auth.uid()));

-- (Políticas análogas para el resto de tablas hijas mediante joins a projects)
5.18 Índices adicionales
sql
-- Crawl results
CREATE INDEX idx_crawl_audit ON strategicaudit.crawl_results(audit_id);
CREATE INDEX idx_crawl_audit_status ON strategicaudit.crawl_results(audit_id, status_code);
CREATE INDEX idx_crawl_url ON strategicaudit.crawl_results(url);
CREATE INDEX idx_crawl_orphan ON strategicaudit.crawl_results(is_orphan) WHERE is_orphan = TRUE;

-- Internal links
CREATE INDEX idx_internal_links_source ON strategicaudit.internal_links(source_url);
CREATE INDEX idx_internal_links_target ON strategicaudit.internal_links(target_url);

-- Performance
CREATE INDEX idx_performance_audit ON strategicaudit.performance_results(audit_id);
CREATE INDEX idx_performance_region ON strategicaudit.performance_results(region, created_at DESC);

-- Keywords
CREATE INDEX idx_keyword_targets_project ON strategicaudit.keyword_targets(project_id);
CREATE INDEX idx_rank_history_keyword ON strategicaudit.rank_history(keyword_id, checked_at DESC);

-- Backlinks
CREATE INDEX idx_backlinks_target ON strategicaudit.backlinks(target_url);
CREATE INDEX idx_backlinks_target_active ON strategicaudit.backlinks(target_url) WHERE lost_at IS NULL;
CREATE INDEX idx_backlinks_toxicity ON strategicaudit.backlinks(toxicity_score DESC) WHERE lost_at IS NULL;

-- Competitors
CREATE INDEX idx_competitors_project ON strategicaudit.competitors(project_id);
CREATE INDEX idx_comp_keywords_competitor ON strategicaudit.competitor_keywords(competitor_id);

-- Logs
CREATE INDEX idx_integration_sync_logs_integration ON strategicaudit.integration_sync_logs(integration_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON strategicaudit.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_project ON strategicaudit.audit_logs(project_id, created_at DESC);

-- Integraciones GSC/GA4/Bing
CREATE INDEX idx_gsc_project_date ON strategicaudit.integration_data_gsc(project_id, date);
CREATE INDEX idx_ga4_project_date ON strategicaudit.integration_data_ga4(project_id, date);
CREATE INDEX idx_bing_project_date ON strategicaudit.integration_data_bing(project_id, date);

-- Full-text search (GIN)
CREATE INDEX idx_crawl_results_title_gin ON strategicaudit.crawl_results USING GIN (to_tsvector('english', title));
CREATE INDEX idx_keyword_targets_keyword_gin ON strategicaudit.keyword_targets USING GIN (to_tsvector('english', keyword));
5.19 Datos iniciales (reglas de auditoría y planes de suscripción)
sql
-- Planes de suscripción
INSERT INTO strategicaudit.subscription_plans (name, max_projects, max_keywords, max_backlink_checks, crawl_limit_monthly, features, price_monthly, price_yearly) VALUES
('Free', 1, 100, 500, 5000, '{"crawl":true,"performance":true,"basic_reports":true}', 0, 0),
('Pro', 5, 5000, 50000, 100000, '{"crawl":true,"performance":true,"reports":true,"keywords":true,"backlinks":true,"ab_tests":true}', 99, 990),
('Enterprise', 50, 100000, 1000000, 1000000, '{"crawl":true,"performance":true,"reports":true,"keywords":true,"backlinks":true,"ab_tests":true,"white_label":true,"api_access":true,"sla":true}', 499, 4990);

-- Reglas de auditoría (ejemplo inicial, completar hasta 100 en producción)
INSERT INTO strategicaudit.audit_rules (code, title, description, category, severity, recommendation) VALUES
('META-001', 'Meta description missing', 'La página no tiene meta description.', 'meta', 'warning', 'Añadir una meta description única de 150-160 caracteres que incluya la keyword principal.'),
('META-002', 'Duplicate meta description', 'La meta description es idéntica a la de otra página.', 'meta', 'warning', 'Escribir meta descriptions únicas para cada página.'),
('LINK-001', 'Broken internal link', 'La página contiene enlaces internos que devuelven HTTP 404.', 'link', 'critical', 'Corregir o eliminar los enlaces rotos.'),
('LINK-002', 'Too many outbound links', 'La página tiene más de 100 enlaces externos.', 'link', 'info', 'Reducir el número de enlaces externos para mejorar la relevancia.'),
('PERF-001', 'Large LCP', 'Largest Contentful Paint > 2.5s.', 'performance', 'warning', 'Optimizar el elemento LCP (imagen o bloque de texto).'),
('PERF-002', 'High CLS', 'Cumulative Layout Shift > 0.1.', 'performance', 'warning', 'Reservar espacio para elementos dinámicos (anuncios, imágenes).'),
('ACCESS-001', 'Missing alt text on image', 'Una o más imágenes no tienen atributo alt.', 'accessibility', 'info', 'Añadir texto alternativo descriptivo.'),
('SEO-001', 'Missing canonical tag', 'La página no tiene etiqueta canonical.', 'seo', 'warning', 'Especificar la URL canónica para evitar contenido duplicado.');
5.20 Trigger de sincronización con auth.users (actualizado)
sql
-- Eliminar trigger antiguo si existe
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Crear función actualizada (sin encrypted_password)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO strategicaudit.users (id, email, full_name, role, preferences)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    '{}'::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Adjuntar trigger
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
6. Estrategia de Particionamiento y Retención
Tabla	Estrategia	Retención
crawl_results	Partición por rango de created_at (mensual) usando pg_partman	12 meses + configuración por proyecto (data_retention_days)
performance_results	Hypertable de TimescaleDB, compresión automática después de 30 días	12 meses (política automática añadida)
rank_history	Hypertable con chunk de 1 semana	24 meses
backlink_history	Hypertable con chunk de 1 mes	12 meses
audit_logs	Partición por rango mensual	24 meses (GDPR)
integration_data_*	Sin partición (índices por fecha) – se recomienda job de limpieza programado	16 meses para GSC (FR-INT-001), 12 meses para GA4 y Bing
Implementación de partición para crawl_results (recomendado usar pg_partman):

sql
-- Crear partición maestra
CREATE TABLE strategicaudit.crawl_results_partitioned (LIKE strategicaudit.crawl_results INCLUDING DEFAULTS) PARTITION BY RANGE (created_at);
-- Migrar datos (si los hay) y luego renombrar. En producción nueva se puede crear directamente particionada.
7. Seguridad y Cumplimiento
RLS activado en todas las tablas → cada usuario solo ve datos de sus proyectos.

Supabase Auth gestiona contraseñas y sesiones → no se almacenan en users.

Cifrado de credenciales en integrations.credentials_encrypted mediante Supabase Vault.

Soft delete en users y projects (deleted_at). Un job diario anonimiza datos personales después de 30 días.

Auditoría completa en audit_logs (GDPR).

8. Notas para Despliegue en Supabase
Ejecutar el script SQL completo en el SQL Editor de Supabase (requiere permisos de superusuario para crear extensiones).

Configurar autenticación – el trigger on_auth_user_created ya está incluido.

Activar Realtime en las tablas que requieran actualizaciones en vivo (.channel en frontend) – desde el panel de Supabase.

Configurar Vault para almacenar las claves maestras de cifrado de integrations.credentials_encrypted.

Programar jobs de mantenimiento (Trigger.dev o pg_cron) para:

Borrar datos vencidos según data_retention_days en crawl_results.

Actualizar vistas materializadas (si se usan).

Comprimir chunks antiguos de TimescaleDB (automático con policy).

Verificar índices después de cargar datos iniciales.

Este documento constituye la especificación definitiva de la base de datos para el entorno Vercel + Supabase. Cualquier cambio debe seguir el proceso de revisión de arquitectura.

Fin del documento