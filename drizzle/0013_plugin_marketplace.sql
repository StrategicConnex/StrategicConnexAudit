-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0013: Plugin Marketplace (P3.4)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Catálogo de Plugins ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plugin_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  author TEXT NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT,
  icon_url TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  homepage TEXT,
  license TEXT DEFAULT 'MIT',
  min_app_version TEXT DEFAULT '1.0.0',
  dependencies JSONB DEFAULT '{}',
  input_schema JSONB DEFAULT '{}',
  output_schema JSONB DEFAULT '{}',
  permissions TEXT[] DEFAULT '{}',
  risk_level TEXT NOT NULL DEFAULT 'passive',
  downloads_count INTEGER NOT NULL DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT '0',
  is_official BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plugin_packages_category ON plugin_packages(category);
CREATE INDEX IF NOT EXISTS idx_plugin_packages_name ON plugin_packages(name);

-- ─── Instancias de Plugins ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plugin_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES plugin_packages(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plugin_instances_user ON plugin_instances(user_id);
CREATE INDEX IF NOT EXISTS idx_plugin_instances_package_project ON plugin_instances(package_id, project_id);

-- ─── Seed Data: Plugins Oficiales ─────────────────────────────────────────

INSERT INTO plugin_packages (name, version, author, description, category, tags, risk_level, is_official, downloads_count, rating)
VALUES
  ('subdomain-enumerator', '1.0.0', 'SCAUDIT Security', 'Descubre subdominios activos mediante técnicas de brute force y Certificate Transparency logs.', 'dns', ARRAY['recon', 'subdomains', 'dns'], 'passive', true, 0, '0'),
  ('port-scanner', '1.0.0', 'SCAUDIT Security', 'Escanea puertos abiertos en hosts objetivo, detectando servicios y versiones.', 'network', ARRAY['network', 'ports', 'scanning'], 'active-intrusive', true, 0, '0'),
  ('tech-stack-detector', '1.0.0', 'SCAUDIT Security', 'Identifica tecnologías web: frameworks, CMS, CDNs, analytics y servidores.', 'website', ARRAY['fingerprint', 'tech'], 'active-safe', true, 0, '0'),
  ('threat-intel-feed', '1.0.0', 'SCAUDIT Security', 'Correlaciona dominios e IPs contra feeds de amenazas conocidas (AlienVault, PhishTank).', 'threat', ARRAY['threats', 'intel', 'feeds'], 'passive', true, 0, '0'),
  ('email-reputation', '1.0.0', 'SCAUDIT Security', 'Analiza reputación de servidores de correo y listas negras DNSBL.', 'email', ARRAY['email', 'reputation', 'dnsbl'], 'passive', true, 0, '0'),
  ('compliance-scanner', '1.0.0', 'SCAUDIT Security', 'Verifica cumplimiento con OWASP Top 10, ISO 27001 y GDPR en endpoints web.', 'compliance', ARRAY['compliance', 'owasp', 'gdpr'], 'active-safe', true, 0, '0'),
  ('whois-enricher', '1.0.0', 'SCAUDIT Security', 'Enriquece datos WHOIS con información de propiedad corporativa y cambios históricos.', 'osint', ARRAY['whois', 'osint', 'enrichment'], 'passive', true, 0, '0'),
  ('certificate-monitor', '1.0.0', 'SCAUDIT Security', 'Monitorea expiración y cambios en certificados SSL/TLS con alertas automáticas.', 'network', ARRAY['ssl', 'certificates', 'monitoring'], 'active-safe', true, 0, '0')
ON CONFLICT (name) DO NOTHING;
