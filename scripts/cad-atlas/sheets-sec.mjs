/* ═══════════════════════════════════════════════════════════════════════════
   LÁMINAS 05–08 — datos, seguridad, reglas de oro y operación
   ═══════════════════════════════════════════════════════════════════════════ */

import {
  C,
  T,
  box,
  conn,
  hv,
  vh,
  line,
  rect,
  table,
  notes,
  para,
  frame,
  titleBlock,
  sheetSvg,
  sectionTag,
  labelPill,
} from "./svg.mjs";

const TOTAL = 10;

function page(n, cfg, inner, m) {
  return sheetSvg(
    [
      frame({ dwg: cfg.dwg, title: cfg.title, subtitle: cfg.subtitle, sheet: n, total: TOTAL, accent: cfg.accent, date: m?.date }),
      inner,
      titleBlock({
        dwg: cfg.dwg,
        subtitle: cfg.blockSub ?? cfg.subtitle,
        sheet: n,
        total: TOTAL,
        accent: cfg.accent,
        date: m?.date,
        scope: cfg.scope ?? "ARQUITECTURA DE SOFTWARE",
      }),
    ].join(""),
  );
}

/* ═════════════════════════════ 05 · MODELO DE DATOS ══════════════════════ */

function entity(x, y, w, name, fields, color = C.ink, badge = "") {
  const out = [];
  out.push(rect(x, y, w, 88, { fill: C.card, stroke: C.ink, sw: 1.8 }));
  out.push(rect(x, y, 5, 88, { fill: color, stroke: "none", sw: 0 }));
  out.push(T(x + 14, y + 26, name, { size: 18, weight: 700 }));
  if (badge) {
    out.push(rect(x + w - 54, y + 10, 44, 20, { fill: C.paper, stroke: C.faint, sw: 1 }));
    out.push(T(x + w - 32, y + 25, badge, { size: 13, anchor: "middle", fill: C.red }));
  }
  fields.forEach((fl, i) => out.push(T(x + 14, y + 50 + i * 20, fl, { size: 15, fill: C.soft })));
  return out.join("");
}

function cluster(x, y, w, h, code, title, accent) {
  return (
    rect(x, y, w, h, { fill: C.paper, stroke: C.faint, sw: 1.2, dash: "6 5" }) +
    T(x + 16, y + 30, `${code} · ${title}`, { size: 18, weight: 700, fill: accent, ls: 0.8 }) +
    line(x + 16, y + 40, x + w - 16, y + 40, { stroke: C.faint, w: 1 })
  );
}

export function sheet05(m) {
  const f = [];

  f.push(sectionTag(150, 350, "A", "MODELO RELACIONAL — NÚCLEO"));

  /* clúster A */
  f.push(cluster(150, 380, 520, 690, "A", "TENANCY Y PRODUCTO", C.gold));
  f.push(entity(170, 440, 480, "users", ["PK id · email · created_at", "auth.users (Supabase)"], C.gold, "RLS"));
  f.push(entity(170, 542, 480, "projects", ["PK id · FK user_id · domain", "name · plan · health_score"], C.gold, "RLS"));
  f.push(entity(170, 644, 480, "audits", ["PK id · FK project_id", "status · score · ran_at"], C.ink, "RLS"));
  f.push(entity(170, 746, 480, "monitoring_schedules", ["PK id · FK project_id · cron", "enabled · last_run_at"], C.ink, "RLS"));
  f.push(entity(170, 848, 480, "keyword_targets", ["PK id · FK project_id · term", "position · volume · cpc"], C.ink, "RLS"));
  f.push(entity(170, 950, 480, "integrations", ["PK id · FK project_id · provider", "gsc · ga4 · bing · tokens"], C.ink, "RLS"));

  /* clúster B */
  f.push(cluster(700, 380, 700, 690, "B", "INTELIGENCIA", C.teal));
  f.push(entity(720, 440, 660, "intelligence_investigations", ["PK id · FK project_id · target · status", "started_at · completed_at · summary"], C.teal, "RLS"));
  f.push(entity(720, 542, 660, "intelligence_tool_runs", ["PK id · FK investigation_id · tool_id", "ok · latency_ms · payload jsonb"], C.ink, "RLS"));
  f.push(entity(720, 644, 660, "intelligence_findings", ["PK id · FK investigation_id · severity", "confidence · mitre_id · evidence"], C.red, "RLS"));
  f.push(entity(720, 746, 660, "intelligence_assets", ["PK id · FK project_id · kind · value", "first_seen · last_seen · source"], C.teal, "RLS"));
  f.push(entity(720, 848, 660, "dns_history / whois_history", ["PK id · FK project_id · domain", "snapshot jsonb · hash · captured_at"], C.ink, "RLS"));
  f.push(entity(720, 950, 660, "intelligence_run_events", ["PK id · FK run_id · type · message", "timeline del escaneo (polling 15 s)"], C.ink, "RLS"));

  /* clúster C */
  f.push(cluster(1430, 380, 520, 690, "C", "ACCESO Y AUDITORÍA", C.red));
  f.push(entity(1450, 440, 480, "developer_api_keys", ["PK id · FK user_id · hash · prefix", "plan · expires_at · revoked_at"], C.red));
  f.push(entity(1450, 542, 480, "security_audit_logs", ["PK id · event_type · ip · user_id", "payload jsonb · created_at"], C.red));
  f.push(entity(1450, 644, 480, "siem_alert_logs", ["PK id · rule · severity · channel", "delivered · attempts · sent_at"], C.ink));
  f.push(entity(1450, 746, 480, "webhook_configs", ["PK id · FK project_id · url · events", "secret (HMAC) · enabled"], C.ink, "RLS"));
  f.push(entity(1450, 848, 480, "push_subscriptions", ["PK id · FK user_id · endpoint", "p256dh · auth · created_at"], C.ink));
  f.push(entity(1450, 950, 480, "plugin_instances", ["PK id · FK project_id · plugin_id", "config · enabled"], C.teal, "RLS"));

  /* clúster D */
  f.push(cluster(150, 1110, 520, 620, "D", "IA Y ENTREGABLES", C.teal));
  f.push(entity(170, 1170, 480, "ai_usage", ["PK id · FK user_id · task_type", "model_used · tokens · latency_ms"], C.teal));
  f.push(entity(170, 1272, 480, "ai_health_logs", ["PK id · model · status · latency_ms", "probed_at · error_code"], C.ink));
  f.push(entity(170, 1374, 480, "reports", ["PK id · FK project_id · kind · status", "storage_path · generated_at"], C.ink, "RLS"));
  f.push(entity(170, 1476, 480, "ai_report_jobs", ["PK id · FK report_id · progress", "step · error · updated_at"], C.ink));
  f.push(entity(170, 1578, 480, "remediation_actions", ["PK id · FK finding_id · action", "approved_by · executed_at"], C.gold));

  /* clúster E */
  f.push(cluster(700, 1110, 700, 620, "E", "COLAS Y EVENTOS", C.gold));
  f.push(entity(720, 1170, 660, "scan_queue", ["PK id · FK project_id · tool · target", "status · plan · attempts · locked_at"], C.gold));
  f.push(entity(720, 1272, 660, "scan_queue_slots", ["PK id · plan · capacity · in_use", "cupo de concurrencia por plan"], C.gold));
  f.push(entity(720, 1374, 660, "outbox_events", ["PK id · event_type · payload jsonb · status", "attempts · dedupe_key · available_at"], C.teal));
  f.push(entity(720, 1476, 660, "adversary_runs", ["PK id · FK project_id · scenario_id", "status · findings · ran_at"], C.red));
  f.push(entity(720, 1578, 660, "audit_rules / project_audit_rules", ["PK id · FK project_id · rule_key", "threshold · enabled"], C.ink));

  /* clúster F */
  f.push(cluster(1430, 1110, 520, 620, "F", "OBSERVABILIDAD", C.ink));
  f.push(entity(1450, 1170, 480, "anomaly_detections", ["PK id · metric · z_score · severity", "window_start · detected_at"], C.red));
  f.push(entity(1450, 1272, 480, "uptime_logs", ["PK id · FK project_id · ok", "response_time_ms · checked_at"], C.ink));
  f.push(entity(1450, 1374, 480, "web_vitals_logs", ["PK id · FK project_id · metric", "value · device_type · session_id"], C.teal));
  f.push(entity(1450, 1476, 480, "app_logs", ["PK id · level · message · context", "request_id · created_at"], C.ink));
  f.push(entity(1450, 1578, 480, "audit_logs / user_logs", ["PK id · actor · action · target", "ip · user_agent · created_at"], C.ink));

  /* relaciones clave (1 → N, padre → hijo) */
  const rel = (pts) => conn(pts, { marker: "arwSoft", color: C.faint, w: 1.6 });
  f.push(rel(vh(410, 530, 410, 542)));
  f.push(rel(vh(410, 630, 410, 644)));
  f.push(rel(hv(650, 586, 720, 586)));
  f.push(rel(vh(1050, 630, 1050, 644)));
  f.push(rel(vh(410, 736, 410, 746)));

  /* leyenda RLS y notas */
  f.push(sectionTag(150, 1790, "B", "CONVENCIONES"));
  f.push(rect(150, 1820, 800, 260, { fill: C.card, stroke: C.ink, sw: 1.6 }));
  const conv = [
    ["PK", "clave primaria (uuid v4)"],
    ["FK", "clave foránea con índice"],
    ["RLS", "tabla con Row Level Security y policy por user_id"],
    ["jsonb", "payload versionado, nunca consultado por campo crítico"],
    ["cascade", "borrado en cascada auditado por check:cascade-drop"],
    ["1 → N", "relación padre → hijo (flecha gris)"],
  ];
  conv.forEach((c, i) => {
    const y = 1858 + i * 36;
    f.push(T(172, y, c[0], { size: 17, weight: 700, fill: c[0] === "RLS" ? C.red : C.gold }));
    f.push(T(300, y, c[1], { size: 17, fill: C.soft }));
  });
  f.push(
    box({
      x: 990,
      y: 1820,
      w: 960,
      h: 260,
      title: "PARIDAD ESQUEMA ↔ MIGRACIONES",
      accent: C.teal,
      subs: [
        `${m.db.tables.total} tablas pgTable y ${m.db.migrations} migraciones SQL en el journal.`,
        "El drift no se tolera: db:drift-check, db:fk-guard,",
        "db:index-guard y retention-index-check corren en CI.",
        "",
        "Las migraciones deben aplicar desde cero sobre Postgres",
        "real (job Integration) — no solo sobre una BD ya migrada.",
      ],
      subSize: 18,
    }),
  );

  /* dominios del esquema */
  const schemaFiles = m.db.tables.byFile;
  f.push(sectionTag(150, 2104, "C", `ARCHIVOS DE ESQUEMA · ${schemaFiles.length}`));
  f.push(T(700, 2104, "Conteo por pgTable(); suma exacta del ERD", { size: 14, fill: C.faint }));
  const half = Math.ceil(schemaFiles.length / 2);
  [schemaFiles.slice(0, half), schemaFiles.slice(half)].forEach((group, gi) => {
    if (!group.length) return;
    f.push(
      table({
        x: 150 + gi * 525,
        y: 2130,
        w: 505,
        cols: [{ label: "ARCHIVO", w: 3 }, { label: "TABLAS", w: 0.55 }],
        rows: group.map((s) => [s.file, String(s.count)]),
        rowH: 24,
        headH: 24,
        size: 13.5,
        headSize: 13.5,
        align: ["start", "end"],
      }),
    );
  });
  f.push(
    box({
      x: 1200,
      y: 2136,
      w: 750,
      h: 340,
      title: "POSTGRES EN LUGAR DE REDIS (ADR-008)",
      accent: C.teal,
      subs: [
        "Un servicio menos que operar y asegurar:",
        "caché L2 y cola viven en la misma BD",
        "que ya tiene RLS y backups.",
        "",
        "La cola usa FOR UPDATE SKIP LOCKED",
        "y slots por plan para no saturar",
        "la base con escaneos concurrentes.",
        "",
        "Trade-off: la BD es también el cuello",
        "de botella; por eso hay índices y",
        "guards de retención en CI.",
      ],
      subSize: 16,
    }),
  );


  return page(
    5,
    {
      dwg: "SCAUDIT-CAD-05",
      title: "MODELO DE DATOS · ERD",
      subtitle: "TENANCY · INTELIGENCIA · ACCESO · IA · COLAS · OBSERVABILIDAD",
      accent: C.teal,
      blockSub: "Entidades del núcleo y sus relaciones",
    },
    f.join(""),
    m,
  );
}

/* ══════════════════════════════ 06 · SEGURIDAD ═══════════════════════════ */

export function sheet06(m) {
  const f = [];
  f.push(sectionTag(150, 350, "A", "DEFENSA EN PROFUNDIDAD"));

  const layers = [
    ["L1 · EDGE", ["CSP con nonce por request", "HSTS preload · X-Frame-Options DENY", "updateSession() refresca y redirige"], C.red],
    ["L2 · API", ["withErrorHandler + AppError tipados", "rate limit distribuido + allowlist", "validación Zod de todo payload"], C.gold],
    ["L3 · MOTOR", ["egress-guard SSRF (CIDR + DNS)", "policy-enforcer de plan", "semáforo y timeouts por tool"], C.gold],
    ["L4 · DATOS", ["withRLS(userId) por transacción", "service_role solo server", "secretos en env-secrets.ts"], C.teal],
    ["L5 · OBSERVABILIDAD", ["security_audit_logs", "SIEM multi-canal + heartbeat", "Sentry con dataCollection mínimo"], C.ink],
  ];
  layers.forEach((l, i) => {
    const y = 380 + i * 218;
    f.push(rect(150, y, 620, 198, { fill: C.card, stroke: C.ink, sw: 2 }));
    f.push(rect(150, y, 8, 198, { fill: l[2], stroke: "none", sw: 0 }));
    f.push(T(176, y + 34, l[0], { size: 22, weight: 700, fill: l[2] }));
    l[1].forEach((s, j) => f.push(T(176, y + 72 + j * 34, "· " + s, { size: 18, fill: C.soft })));
    if (i < 4) f.push(conn([[460, y + 198], [460, y + 218]], { marker: "arw" }));
  });

  /* trust boundaries */
  f.push(sectionTag(830, 350, "B", "FRONTERAS DE CONFIANZA"));
  f.push(
    table({
      x: 830,
      y: 376,
      w: 1120,
      cols: [
        { label: "ID", w: 0.5 },
        { label: "FRONTERA", w: 2.4 },
        { label: "CONTROL REAL", w: 5.4 },
      ],
      rows: [
        ["TB-1", "Cliente → Edge", "CSP nonce · HSTS · X-Frame-Options · Referrer-Policy · report-uri"],
        ["TB-2", "Edge → Route", "updateSession(): refresco de sesión y redirect a /login"],
        ["TB-3", "Route → Dominio", "Rate limit fail-closed acotado · circuit breaker fail-open 1.5 s"],
        ["TB-4", "Dominio → Externo", "egress-guard: CIDR privados v4/v6 + ::ffff: · DNS revalidado"],
        ["TB-5", "Dominio → DB", "withRLS + claims JWT · admin solo server · secretos server-only"],
        ["TB-6", "Sistema → Webhook", "Firma HMAC SHA-256 + suscripción de eventos"],
      ],
      rowH: 54,
      headH: 38,
      size: 17,
    }),
  );

  /* modos de falla */
  f.push(sectionTag(830, 770, "C", "MODO DE FALLA DECLARADO"));
  f.push(
    table({
      x: 830,
      y: 796,
      w: 1120,
      cols: [
        { label: "COMPONENTE", w: 1.9 },
        { label: "MODO", w: 1 },
        { label: "COMPORTAMIENTO", w: 4.6 },
      ],
      rows: [
        ["Rate limit", "FAIL-CLOSED", "Si el store cae, sigue limitando en memoria + techo por instancia"],
        ["Egress guard", "FAIL-CLOSED", "Ante duda de resolución, bloquea la salida"],
        ["Circuit breaker", "FAIL-OPEN", "Servicio auxiliar: se salta y se degrada, nunca tumba la app"],
        ["Caché L2", "FAIL-OPEN", "Se ignora y se consulta el origen"],
        ["IA", "DEGRADACIÓN", "Onboarding si no hay key; failover; error accionable si todo falla"],
      ],
      rowH: 46,
      headH: 38,
      size: 17,
      colors: [C.ink, C.red, C.soft, C.soft, C.soft],
    }),
  );

  /* bloques SSRF / headers */
  f.push(
    box({
      x: 830,
      y: 1080,
      w: 550,
      h: 300,
      title: "EGRESS GUARD · SSRF",
      accent: C.red,
      subs: [
        "Solo http: y https:.",
        "Bloquea loopback, link-local,",
        "RFC1918, 0.0.0.0/8, 198.18/15,",
        "169.254/16 y ::ffff:x.x.x.x.",
        "Revalida cada redirect y",
        "usa User-Agent propio.",
      ],
      subSize: 17,
    }),
  );
  f.push(
    box({
      x: 1400,
      y: 1080,
      w: 550,
      h: 300,
      title: "CABECERAS Y CSP",
      accent: C.teal,
      subs: [
        "default-src 'self'",
        "script-src 'nonce-…' 'strict-dynamic'",
        "object-src 'none' · frame-ancestors 'none'",
        "connect-src 'self' + Supabase",
        "HSTS 31536000 · includeSubDomains",
        "Permisos de navegador restringidos",
      ],
      subSize: 17,
    }),
  );

  /* RLS */
  f.push(sectionTag(150, 1500, "D", "RLS — SECUENCIA TRANSACCIONAL"));
  f.push(rect(150, 1530, 1800, 380, { fill: C.card, stroke: C.ink, sw: 2 }));
  const steps = [
    ["01", "BEGIN", "abre transacción"],
    ["02", "set_config('request.jwt.claims', claims, true)", "claims con sub = userId"],
    ["03", "set_config('role', 'authenticated', true)", "rol efectivo solo en la tx"],
    ["04", "…queries del callback…", "policies filtran por sub"],
    ["05", "COMMIT", "el rol vuelve al de sesión"],
  ];
  steps.forEach((s, i) => {
    const y = 1568 + i * 62;
    f.push(rect(176, y - 26, 44, 34, { fill: C.paper, stroke: C.ink, sw: 1.2 }));
    f.push(T(198, y - 2, s[0], { size: 16, anchor: "middle", weight: 700, fill: C.gold }));
    f.push(T(238, y, s[1], { size: 19, weight: 600 }));
    f.push(T(1000, y, s[2], { size: 17, fill: C.soft }));
    if (i < 4) f.push(conn([[198, y + 8], [198, y + 36]], { marker: "arw", w: 1.6 }));
  });
  f.push(rect(1560, 1556, 370, 306, { fill: C.paper, stroke: C.red, sw: 2, dash: "8 6" }));
  f.push(T(1580, 1590, "INVARIANTES", { size: 18, weight: 700, fill: C.red }));
  f.push(
    para(
      1580,
      1620,
      320,
      "Nunca SET ROLE sin LOCAL. Nunca confiar en el projectId del cliente. Nunca consultar sin RLS fuera del backend de jobs. Nunca devolver stack traces.",
      { size: 15, lh: 21 },
    ),
  );
  f.push(T(1580, 1818, "1 roundtrip por transacción", { size: 15, fill: C.teal, weight: 700 }));
  f.push(T(1580, 1838, "(TD-28a verificado en Postgres)", { size: 14, fill: C.soft }));

  /* STRIDE */
  f.push(sectionTag(150, 1950, "E", "AMENAZAS → CONTROL (STRIDE)"));
  f.push(
    table({
      x: 150,
      y: 1976,
      w: 1800,
      cols: [
        { label: "AMENAZA", w: 1.6 },
        { label: "SUPERFICIE", w: 2 },
        { label: "CONTROL", w: 5.4 },
      ],
      rows: [
        ["Spoofing", "login / callback", "Magic Link + allowlist de email + rate limit"],
        ["Tampering", "HTTP en tránsito", "HSTS + upgrade-insecure-requests + egress-guard"],
        ["Repudiation", "acciones de usuario", "security_audit_logs + exportador SIEM"],
        ["Information disclosure", "APIs multi-tenant", "RLS + auth + service_role solo server"],
        ["Denial of service", "endpoints y motor", "rate limit acotado + semáforos + timeouts"],
        ["Elevation of privilege", "datos de proyecto", "RLS por claim sub + autorización owner-only"],
      ],
      rowH: 38,
      headH: 34,
      size: 16,
      zebra: true,
    }),
  );

  f.push(
    notes(
      150,
      2260,
      1800,
      [
        "Los controles son independientes: la caída de uno no anula los demás (defensa en profundidad).",
        "La autorización es owner-only: el user_id sale del token, jamás del body.",
        "Los logs de seguridad se escriben con logSecurityEvent() y alimentan el exportador SIEM.",
      ],
      { size: 16, lh: 21 },
    ),
  );

  return page(
    6,
    {
      dwg: "SCAUDIT-CAD-06",
      title: "SEGURIDAD · FRONTERAS DE CONFIANZA",
      subtitle: "5 CAPAS · 6 FRONTERAS · MODOS DE FALLA · RLS",
      accent: C.red,
      blockSub: "Qué protege cada capa y cómo falla",
    },
    f.join(""),
    m,
  );
}

/* ═════════════════════════════ 07 · REGLAS DE ORO ════════════════════════ */

export function sheet07(m) {
  const f = [];
  f.push(sectionTag(150, 350, "A", "JERARQUÍA NORMATIVA"));
  const hier = [
    ["CONSTITUCIÓN", "principios no negociables"],
    ["CORE_SYSTEM", "doctrina del copilot"],
    ["ADR", "decisiones con contexto"],
    ["AGENTS.md", "reglas operativas"],
    ["CI / GUARDS", "verificación automática"],
  ];
  hier.forEach((h, i) => {
    const x = 150 + i * 362;
    f.push(rect(x, 380, 340, 96, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(T(x + 14, 412, h[0], { size: 18, weight: 700, fill: i === 4 ? C.gold : C.ink }));
    f.push(T(x + 14, 440, h[1], { size: 15, fill: C.soft }));
    if (i < 4) f.push(conn([[x + 340, 428], [x + 362, 428]], { marker: "arw", w: 1.8 }));
  });

  const rules = [
    ["R-01", "FAIL-CLOSED EN SEGURIDAD", "Rate limit, egress guard y autorización niegan ante duda. Solo los auxiliares (breaker, caché) degradan a fail-open.", "rate-limiter.test · egress-guard.fuzz", C.red],
    ["R-02", "NINGÚN DATO SIN RLS", "Toda lectura o escritura multi-tenant pasa por withRLS(userId). El id del cliente no es autorización.", "rls.test · tests/security", C.red],
    ["R-03", "SECRETOS SOLO SERVER", "Keys, service_role y CRON_SECRET viven en env-secrets.ts. Nunca en bundle, logs ni respuestas.", "guard:secrets", C.red],
    ["R-04", "SALIDA EXTERNA VALIDADA", "Toda petición HTTP del motor pasa por egress-guard: IP pública, protocolo permitido, redirects revalidados.", "egress-guard.test", C.gold],
    ["R-05", "FUENTE ÚNICA DE TOOLS", "Solo tool-registry.ts registra herramientas. Un tool nuevo no crea una segunda superficie de ejecución.", "check:entrypoint · ADR-001", C.gold],
    ["R-06", "EL CLIENTE NO SABE DE IA", "Componentes no conocen provider, fallback ni keys. Solo el hook y el contrato AIResponse.", "CORE_SYSTEM §3", C.gold],
    ["R-07", "HUMANO ANTES DE IRREVERSIBLE", "Recomendación → revisión → aprobación → ejecución → auditoría. La IA nunca ejecuta cambios destructivos.", "CORE_SYSTEM §8", C.gold],
    ["R-08", "DATO EXTERNO = NO CONFIABLE", "OSINT, evidencias y logs van delimitados; jamás sobrescriben instrucciones del sistema.", "intelligence-context.test", C.gold],
    ["R-09", "LA APP NO DEPENDE DE LA IA", "Sin key o con el pool caído, el producto sigue operativo; solo se degrada el copilot.", "e2e-ai-router", C.teal],
    ["R-10", "MIGRACIONES DESDE CERO", "Idempotentes, con stubs de plataforma y fail-closed: sin roles no hay verde silencioso.", "Integration (Postgres real)", C.teal],
    ["R-11", "SIN EVIDENCIA NO HAY DONE", "Ninguna afirmación de validación sin comando ejecutado y salida observada.", "quality-gate · revisión", C.teal],
    ["R-12", "OWNER-ONLY POR DEFECTO", "El acceso a datos de proyecto se deriva del ownership, no de membresías implícitas.", "ADR-010 · migración 0052", C.teal],
    ["R-13", "PRESUPUESTO DE LATENCIA", "120 s por route, IA ≤ 110 s, piso de 512 max_tokens en failover.", "MODEL_TIMEOUTS · e2e", C.ink],
    ["R-14", "SEMÁNTICA, NO COLORES", "UI solo con tokens OKLCH; WCAG 2.2 AA en ambos temas; animación respeta reduced-motion.", "a11y.spec · design tokens", C.ink],
    ["R-15", "PARIDAD DE IDIOMA", "Toda clave i18n existe en es y en; los prompts de IA también son bilingües.", "guard:i18n", C.ink],
    ["R-16", "UN PUNTO DE ENTRADA", "Una ruta, un handler; sin duplicar lógica entre camino síncrono y worker de cola.", "check:entrypoint · review", C.ink],
  ];

  rules.forEach((r, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 150 + col * 890;
    const y = 520 + row * 205;
    f.push(rect(x, y, 875, 188, { fill: C.card, stroke: C.ink, sw: 1.8 }));
    f.push(rect(x, y, 6, 188, { fill: r[5], stroke: "none", sw: 0 }));
    f.push(T(x + 20, y + 32, r[0], { size: 19, weight: 700, fill: r[5] }));
    f.push(T(x + 90, y + 32, r[1], { size: 20, weight: 700 }));
    f.push(para(x + 20, y + 62, 830, r[2], { size: 16.5, lh: 22 }));
    f.push(line(x + 20, y + 148, x + 855, y + 148, { stroke: C.faint, w: 1 }));
    f.push(T(x + 20, y + 172, "VERIFICA", { size: 13, fill: C.faint, weight: 700, ls: 1 }));
    f.push(T(x + 106, y + 172, r[3], { size: 15, fill: C.soft }));
  });

  f.push(rect(150, 2180, 1800, 190, { fill: C.paper, stroke: C.red, sw: 2.4, dash: "10 6" }));
  f.push(T(176, 2218, "CLÁUSULA DE BLOQUEO", { size: 20, weight: 700, fill: C.red, ls: 1.2 }));
  f.push(
    para(
      176,
      2248,
      1690,
      "Una violación de R-01 a R-08 bloquea el merge: son condiciones de seguridad, no preferencias de estilo. Las reglas R-09 a R-16 son condiciones de entrega y se verifican en el mismo pipeline. Excepción documentada únicamente vía ADR con fecha, motivo y control compensatorio.",
      { size: 17, lh: 24 },
    ),
  );

  return page(
    7,
    {
      dwg: "SCAUDIT-CAD-07",
      title: "REGLAS DE ORO · CONSTITUCIÓN",
      subtitle: "16 INVARIANTES DE INGENIERÍA Y SU VERIFICACIÓN AUTOMÁTICA",
      accent: C.gold,
      blockSub: "Invariantes no negociables del sistema",
      scope: "GOBIERNO DE INGENIERÍA",
    },
    f.join(""),
    m,
  );
}

/* ══════════════════════════════ 08 · OPERACIÓN ═══════════════════════════ */

export function sheet08(m) {
  const f = [];
  f.push(sectionTag(150, 350, "A", "LÍNEA DE TIEMPO DE JOBS (UTC)"));

  const tx = 150;
  const tw = 1800;
  const ty = 560;
  f.push(line(tx, ty, tx + tw, ty, { stroke: C.ink, w: 2.4 }));
  for (let h = 0; h <= 24; h += 2) {
    const x = tx + (h / 24) * tw;
    f.push(line(x, ty - 10, x, ty + 10, { stroke: C.ink, w: 1.6 }));
    f.push(T(x, ty + 32, `${String(h).padStart(2, "0")}`, { size: 15, anchor: "middle", fill: C.soft }));
  }
  const marks = [
    [0.15, "cleanup", 0],
    [3, "SIEM", 0],
    [3.5, "uptime", 1],
    [4, "AI health", 2],
    [9, "API keys", 3],
  ];
  marks.forEach((m) => {
    const x = tx + (m[0] / 24) * tw;
    const y = ty - 44 - m[2] * 36;
    f.push(line(x, ty - 6, x, y + 6, { stroke: C.gold, w: 1.4, dash: "5 4" }));
    f.push(rect(x - 7, ty - 13, 14, 14, { fill: C.gold, stroke: C.ink, sw: 1 }));
    f.push(T(x + 11, y + 6, m[1], { size: 15, fill: C.ink }));
  });
  f.push(T(150, 386, "Alta frecuencia: SIEM y cola cada 5 min · uptime y anomalías cada 15 min · escaneo cada hora · discovery y adversary cada 6 h", { size: 16, fill: C.soft }));

  /* jobs table */
  f.push(sectionTag(150, 640, "B", "CATÁLOGO DE JOBS"));
  f.push(
    table({
      x: 150,
      y: 666,
      w: 1120,
      cols: [
        { label: "JOB", w: 2.4 },
        { label: "DISPARO", w: 1.6 },
        { label: "EFECTO", w: 4.2 },
      ],
      rows: [
        ["siemExporterTask", "*/5 min", "detecta patrones y despacha alertas"],
        ["drainScanQueue", "*/5 min + wakeup", "drena scan_queue con SKIP LOCKED"],
        ["uptimeMonitor", "*/15 min", "comprueba uptime y latencia"],
        ["periodicAnomalyDetection", "*/15 min", "Z-score sobre latencia y error rate"],
        ["scheduledScanTask", "cada hora", "monitoring_schedules vencidos → audit"],
        ["continuousDiscovery", "cada 6 h", "DNS brute, CT logs, shadow assets"],
        ["periodicAdversarySimulation", "cada 6 h", "12 escenarios MITRE"],
        ["apiKeyExpiryAlert", "09:00", "keys por expirar → SIEM"],
        ["cleanupOldLogs", "00:00", "purga por retención"],
      ],
      rowH: 42,
      headH: 38,
      size: 17,
      zebra: true,
    }),
  );

  /* señales */
  f.push(sectionTag(1320, 640, "C", "SEÑALES Y SUMIDEROS"));
  f.push(
    table({
      x: 1320,
      y: 666,
      w: 630,
      cols: [{ label: "SEÑAL", w: 2.2 }, { label: "DESTINO", w: 2.2 }],
      rows: [
        ["Errores y trazas", "Sentry /monitoring"],
        ["Logs de app", "app_logs"],
        ["Eventos de seguridad", "security_audit_logs"],
        ["Alertas entregadas", "siem_alert_logs"],
        ["Salud de modelos", "ai_health_logs"],
        ["Web Vitals (RUM)", "web_vitals_logs"],
        ["Anomalías", "anomaly_detections"],
        ["Uptime", "uptime_logs"],
        ["Health público", "/api/public/v1/health"],
      ],
      rowH: 46,
      headH: 38,
      size: 17,
    }),
  );

  /* reglas SIEM */
  f.push(sectionTag(150, 1160, "D", "REGLAS SIEM"));
  f.push(
    table({
      x: 150,
      y: 1186,
      w: 1120,
      cols: [{ label: "REGLA", w: 2.4 }, { label: "PATRÓN", w: 4.4 }, { label: "CANALES", w: 2.6 }],
      rows: [
        ["Open redirect attack", "múltiples intentos desde una IP", "Slack · Email · PagerDuty"],
        ["Rate limit bypass", "IPs rotadas contra el limitador", "Slack · Email"],
        ["AI model failure", "status=down en healthcheck", "Slack · Email · PagerDuty"],
        ["CSP spike", ">10 violaciones en 5 min", "Slack · Email"],
        ["Auth failure burst", "fallos de autenticación en 1 min", "Slack · PagerDuty"],
        ["API key expiry", "keys que expiran en 1–7 días", "Slack · Email"],
        ["Heartbeat", "ping cada 30 min", "todos los canales"],
      ],
      rowH: 48,
      headH: 38,
      size: 17,
      zebra: true,
    }),
  );

  /* flujo de incidente */
  f.push(sectionTag(1320, 1160, "E", "RESPUESTA A INCIDENTE"));
  const inc = [
    ["DETECTAR", "alerta SIEM o health degradado"],
    ["TRIAR", "severidad, alcance, tenant"],
    ["CONGELAR", "breaker/flag, sin cambios destructivos"],
    ["MITIGAR", "rollback o failover documentado"],
    ["VERIFICAR", "health + evidencia ejecutada"],
    ["REGISTRAR", "postmortem en CHANGELOG"],
  ];
  inc.forEach((s, i) => {
    const y = 1192 + i * 72;
    f.push(rect(1320, y, 630, 60, { fill: C.card, stroke: C.ink, sw: 1.6 }));
    f.push(T(1338, y + 25, `${String(i + 1).padStart(2, "0")} · ${s[0]}`, { size: 16, weight: 700, fill: i > 2 ? C.gold : C.red }));
    f.push(T(1338, y + 48, s[1], { size: 15, fill: C.soft }));
    if (i < 5) f.push(conn([[1635, y + 60], [1635, y + 72]], { marker: "arw", w: 1.6 }));
  });

  /* salud */
  f.push(sectionTag(150, 1650, "F", "ESTADO DE SALUD Y DEGRADACIÓN"));
  f.push(rect(150, 1676, 1800, 230, { fill: C.card, stroke: C.ink, sw: 2 }));
  const health = [
    ["OK", "todos los controles responden", C.green],
    ["DEGRADED", "IA o caché caída; producto operativo", C.gold],
    ["DOWN", "DB inaccesible o health 5xx", C.red],
  ];
  health.forEach((h, i) => {
    const x = 180 + i * 590;
    f.push(rect(x, 1700, 540, 96, { fill: C.paper, stroke: h[2], sw: 2 }));
    f.push(T(x + 18, 1734, h[0], { size: 22, weight: 700, fill: h[2] }));
    f.push(para(x + 18, 1762, 500, h[1], { size: 16, lh: 22 }));
  });
  f.push(T(180, 1824, "Health público: GET /api/public/v1/health devuelve status y dbConfigured sin filtrar detalles internos.", { size: 16, fill: C.soft }));
  f.push(T(180, 1846, "Toda alerta incluye correlationId; los reintentos del exportador son idempotentes por clave de evento.", { size: 16, fill: C.soft }));
  f.push(T(180, 1868, "El heartbeat de 30 min detecta el fallo silencioso del pipeline, no solo la caída del servicio.", { size: 16, fill: C.soft }));

  /* endpoints operativos */
  f.push(sectionTag(150, 1960, "G", "ENDPOINTS OPERATIVOS"));
  f.push(
    table({
      x: 150,
      y: 1986,
      w: 1800,
      cols: [
        { label: "ENDPOINT", w: 3.4 },
        { label: "AUTORIZACIÓN", w: 2.2 },
        { label: "FUNCIÓN", w: 4.6 },
      ],
      rows: [
        ["GET /api/public/v1/health", "público", "status + dbConfigured, sin detalles internos"],
        ["GET /api/ai/healthcheck", "CRON_SECRET o sesión", "probes del pool + guard de env-parity"],
        ["POST /api/security/siem/run", "sesión + rol", "ejecuta el exportador bajo demanda"],
        ["GET /api/cron/siem · /api/cron/uptime", "CRON_SECRET", "jobs garantizados de Vercel"],
        ["GET /api/intelligence/anomalies", "sesión", "filtra por proyecto, métrica y severidad"],
      ],
      rowH: 40,
      headH: 36,
      size: 16,
      zebra: true,
    }),
  );

  f.push(
    notes(
      150,
      2280,
      1800,
      [
        "Vercel Cron es el mecanismo garantizado; Trigger.dev añade frecuencia pero su indisponibilidad no rompe la operación.",
        "La purga de cola corre dentro del dispatcher diario: no consume un slot de cron propio.",
        "Los jobs son idempotentes por diseño: reintentar no duplica hallazgos ni alertas.",
      ],
      { size: 16, lh: 21 },
    ),
  );

  return page(
    8,
    {
      dwg: "SCAUDIT-CAD-08",
      title: "OPERACIÓN · JOBS Y OBSERVABILIDAD",
      subtitle: "CALENDARIO · SEÑALES · SIEM · RESPUESTA A INCIDENTES",
      accent: C.teal,
      blockSub: "Qué corre, cuándo y cómo se detecta un fallo",
      scope: "OPERACIONES",
    },
    f.join(""),
    m,
  );
}
