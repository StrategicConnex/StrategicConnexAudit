-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0030: planes de referencia + lectura pública del catálogo (A-4)
--
-- La página /pricing y el modal de upgrade leen estos planes. Nombres
-- alineados con QUOTAS_BY_PLAN (free/pro/business/enterprise). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO subscription_plans
  (name, max_projects, max_keywords, max_backlink_checks, crawl_limit_monthly, features, price_monthly, price_yearly)
SELECT 'free', 1, 50, 100, 1000,
  '{"seats": 1, "whiteLabel": false, "apiAccess": false}'::jsonb,
  '0', '0'
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'free');

INSERT INTO subscription_plans
  (name, max_projects, max_keywords, max_backlink_checks, crawl_limit_monthly, features, price_monthly, price_yearly)
SELECT 'pro', 10, 5000, 10000, 500000,
  '{"seats": 5, "whiteLabel": false, "apiAccess": true}'::jsonb,
  '49.00', '490.00'
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'pro');

INSERT INTO subscription_plans
  (name, max_projects, max_keywords, max_backlink_checks, crawl_limit_monthly, features, price_monthly, price_yearly)
SELECT 'business', 50, 25000, 100000, 2000000,
  '{"seats": 15, "whiteLabel": true, "apiAccess": true}'::jsonb,
  '149.00', '1490.00'
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'business');

INSERT INTO subscription_plans
  (name, max_projects, max_keywords, max_backlink_checks, crawl_limit_monthly, features, price_monthly, price_yearly)
SELECT 'enterprise', 999, 999999, 9999999, 99999999,
  '{"seats": 999, "whiteLabel": true, "apiAccess": true}'::jsonb,
  NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'enterprise');

-- Catálogo público: /pricing es marketing sin sesión.
DROP POLICY IF EXISTS subscription_plans_public_read ON subscription_plans;
CREATE POLICY subscription_plans_public_read ON subscription_plans FOR SELECT TO anon USING (true);
