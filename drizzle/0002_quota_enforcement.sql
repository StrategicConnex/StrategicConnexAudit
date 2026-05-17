-- Función para verificar la cuota de proyectos
CREATE OR REPLACE FUNCTION check_project_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_max_projects INTEGER;
    v_current_projects INTEGER;
BEGIN
    -- Obtener el límite del plan del usuario
    SELECT sp.max_projects INTO v_max_projects
    FROM users u
    JOIN subscription_plans sp ON u.plan_id = sp.id
    WHERE u.id = NEW.owner_id;

    -- Si no tiene plan o el límite es NULL, asumimos un plan básico restrictivo (fail-safe)
    IF v_max_projects IS NULL THEN
        v_max_projects := 1;
    END IF;

    -- Contar proyectos actuales (excluyendo eliminados)
    SELECT COUNT(*) INTO v_current_projects
    FROM projects
    WHERE owner_id = NEW.owner_id AND deleted_at IS NULL;

    IF v_current_projects >= v_max_projects THEN
        RAISE EXCEPTION 'LIMIT_EXCEEDED: Has alcanzado el límite de % proyectos para tu plan actual.', v_max_projects;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para la tabla projects
DROP TRIGGER IF EXISTS tr_check_project_quota ON projects;
CREATE TRIGGER tr_check_project_quota
BEFORE INSERT ON projects
FOR EACH ROW
EXECUTE FUNCTION check_project_quota();

-- Función para verificar la cuota mensual de crawls/auditorías
CREATE OR REPLACE FUNCTION check_audit_quota()
RETURNS TRIGGER AS $$
DECLARE
    v_crawl_limit INTEGER;
    v_current_crawls INTEGER;
    v_owner_id UUID;
BEGIN
    -- Obtener el dueño del proyecto
    SELECT owner_id INTO v_owner_id FROM projects WHERE id = NEW.project_id;

    -- Obtener el límite del plan del dueño
    SELECT sp.crawl_limit_monthly INTO v_crawl_limit
    FROM users u
    JOIN subscription_plans sp ON u.plan_id = sp.id
    WHERE u.id = v_owner_id;

    -- Fail-safe para límites nulos
    IF v_crawl_limit IS NULL THEN
        v_crawl_limit := 5;
    END IF;

    -- Contar auditorías del mes actual para el usuario (a través de todos sus proyectos)
    SELECT COUNT(*) INTO v_current_crawls
    FROM audits a
    JOIN projects p ON a.project_id = p.id
    WHERE p.owner_id = v_owner_id
      AND a.created_at >= date_trunc('month', now())
      AND a.status != 'canceled';

    IF v_current_crawls >= v_crawl_limit THEN
        RAISE EXCEPTION 'LIMIT_EXCEEDED: Has agotado tu cuota de % auditorías mensuales.', v_crawl_limit;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para la tabla audits
DROP TRIGGER IF EXISTS tr_check_audit_quota ON audits;
CREATE TRIGGER tr_check_audit_quota
BEFORE INSERT ON audits
FOR EACH ROW
EXECUTE FUNCTION check_audit_quota();
